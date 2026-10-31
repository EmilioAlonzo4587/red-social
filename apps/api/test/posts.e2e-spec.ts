import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request, { type Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import type { MeDto } from './../src/auth/dto/me.dto';
import type { ErrorResponseDto } from './../src/common/dto/error-response.dto';
import { configureApp } from './../src/configure-app';
import { CloudinaryService } from './../src/media/cloudinary.service';
import type { PostDto } from './../src/posts/dto/post.dto';
import { PrismaService } from './../src/prisma/prisma.service';
import { cookiesOf } from './utils/cookies';
import { resetDatabase } from './utils/database';

const postOf = (res: Response) => res.body as PostDto;
const meOf = (res: Response) => res.body as MeDto;
const ruleOf = (res: Response, field: string) =>
  (res.body as ErrorResponseDto).details.find((d) => d.field === field)?.rule;

describe('Publicaciones (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  // Otra IP por prueba para no cruzar el límite de 5 registros por minuto (ver auth.e2e-spec.ts)
  let ipCounter = 0;
  let ip: string;
  // Mismo prefijo users/{id}/ que el servicio real, sin llamar a Cloudinary de verdad
  const cloudinary = {
    belongsToUser: (publicId: string, userId: string) =>
      publicId.startsWith(`users/${userId}/`),
    deleteByPublicId: jest.fn().mockResolvedValue(undefined),
  };

  async function signUp(username: string) {
    const res = await request(server)
      .post('/api/auth/register')
      .set('X-Forwarded-For', ip)
      .send({
        username,
        email: `${username}@example.com`,
        password: 'una-clave-larga',
      })
      .expect(201);
    return {
      id: meOf(res).id,
      cookie: `access_token=${cookiesOf(res).access_token.value}`,
    };
  }

  const image = (userId: string, name: string) => ({
    publicId: `users/${userId}/${name}`,
    width: 1200,
    height: 800,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CloudinaryService)
      .useValue(cloudinary)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    ip = `10.0.4.${++ipCounter}`;
    cloudinary.deleteByPublicId.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/posts', () => {
    it('201: crea con texto recortado e imágenes en orden, y devuelve Post', async () => {
      const ana = await signUp('ana_lopez');

      const res = await request(server)
        .post('/api/posts')
        .set('Cookie', ana.cookie)
        .send({
          content: '  Primer atardecer  ',
          media: [image(ana.id, 'b'), image(ana.id, 'a')],
        })
        .expect(201);

      expect(Object.keys(res.body as object).sort()).toEqual(
        [
          'id',
          'author',
          'content',
          'media',
          'likeCount',
          'commentCount',
          'likedByMe',
          'createdAt',
          'editedAt',
        ].sort(),
      );
      expect(postOf(res)).toMatchObject({
        author: {
          id: ana.id,
          username: 'ana_lopez',
          displayName: null,
          avatarPublicId: null,
        },
        content: 'Primer atardecer',
        media: [
          { ...image(ana.id, 'b'), mediaType: 'image' },
          { ...image(ana.id, 'a'), mediaType: 'image' },
        ],
        likeCount: 0,
        commentCount: 0,
        likedByMe: false,
      });
    });

    it('201: solo texto o solo imágenes', async () => {
      const ana = await signUp('ana_lopez');

      const text = await request(server)
        .post('/api/posts')
        .set('Cookie', ana.cookie)
        .send({ content: 'Hola' })
        .expect(201);
      expect(postOf(text).media).toEqual([]);

      const images = await request(server)
        .post('/api/posts')
        .set('Cookie', ana.cookie)
        .send({ media: [image(ana.id, 'foto')] })
        .expect(201);
      expect(postOf(images).content).toBeNull();
    });

    it('400 si no trae texto ni imágenes, o el texto es solo espacios (RN03)', async () => {
      const ana = await signUp('ana_lopez');

      for (const body of [{}, { content: '   ', media: [] }]) {
        const res = await request(server)
          .post('/api/posts')
          .set('Cookie', ana.cookie)
          .send(body)
          .expect(400);
        expect(ruleOf(res, 'content')).toBe('contentOrMedia');
      }
      expect(await prisma.post.count()).toBe(0);
    });

    it('400 si content pasa de 2000 o hay más de 4 imágenes (RN03)', async () => {
      const ana = await signUp('ana_lopez');

      const res = await request(server)
        .post('/api/posts')
        .set('Cookie', ana.cookie)
        .send({
          content: 'a'.repeat(2001),
          media: ['1', '2', '3', '4', '5'].map((n) => image(ana.id, n)),
        })
        .expect(400);
      expect(ruleOf(res, 'content')).toBe('maxLength');
      expect(ruleOf(res, 'media')).toBe('arrayMaxSize');
    });

    it('400 si una medida no es un entero positivo o falta el publicId', async () => {
      const ana = await signUp('ana_lopez');

      const res = await request(server)
        .post('/api/posts')
        .set('Cookie', ana.cookie)
        .send({
          media: [
            { publicId: `users/${ana.id}/a`, width: 0, height: 1.5 },
            { width: 10, height: 10 },
          ],
        })
        .expect(400);
      expect(ruleOf(res, 'media.0.width')).toBe('min');
      expect(ruleOf(res, 'media.0.height')).toBeDefined();
      expect(ruleOf(res, 'media.1.publicId')).toBeDefined();
    });

    it('400 si una imagen es de otro usuario (RN04)', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');

      const res = await request(server)
        .post('/api/posts')
        .set('Cookie', ana.cookie)
        .send({ media: [image(ana.id, 'mia'), image(beto.id, 'de-beto')] })
        .expect(400);
      expect(ruleOf(res, 'media.1.publicId')).toBe('ownership');
      expect(await prisma.post.count()).toBe(0);
    });

    it('400 si intenta elegir el autor u otro campo no permitido', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');

      const res = await request(server)
        .post('/api/posts')
        .set('Cookie', ana.cookie)
        .send({ content: 'Hola', authorId: beto.id })
        .expect(400);
      expect(ruleOf(res, 'authorId')).toBe('whitelistValidation');
    });

    it('401 sin sesión', async () => {
      await request(server)
        .post('/api/posts')
        .send({ content: 'Hola' })
        .expect(401);
    });
  });

  describe('GET /api/posts/:id', () => {
    it('200: devuelve la publicación e indica si le di like', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const created = await request(server)
        .post('/api/posts')
        .set('Cookie', ana.cookie)
        .send({ content: 'Hola', media: [image(ana.id, 'foto')] })
        .expect(201);
      const { id } = postOf(created);
      // El like va directo en la base: su endpoint llega en S2-07
      await prisma.postLike.create({ data: { userId: beto.id, postId: id } });

      const forBeto = await request(server)
        .get(`/api/posts/${id}`)
        .set('Cookie', beto.cookie)
        .expect(200);
      expect(postOf(forBeto)).toEqual({ ...postOf(created), likedByMe: true });

      const forAna = await request(server)
        .get(`/api/posts/${id}`)
        .set('Cookie', ana.cookie)
        .expect(200);
      expect(postOf(forAna).likedByMe).toBe(false);
    });

    it('404 si no existe o fue eliminada', async () => {
      const ana = await signUp('ana_lopez');
      const deleted = await prisma.post.create({
        data: { authorId: ana.id, content: 'borrada', deletedAt: new Date() },
      });

      for (const id of [deleted.id, '01a17fbf-5024-7141-88aa-8c7e3ffa3259']) {
        await request(server)
          .get(`/api/posts/${id}`)
          .set('Cookie', ana.cookie)
          .expect(404);
      }
    });

    it('400 si el id no es un UUID', async () => {
      const ana = await signUp('ana_lopez');
      const res = await request(server)
        .get('/api/posts/no-es-uuid')
        .set('Cookie', ana.cookie)
        .expect(400);
      expect(ruleOf(res, 'id')).toBe('isUuid');
    });

    it('401 sin sesión', async () => {
      await request(server)
        .get('/api/posts/01a17fbf-5024-7141-88aa-8c7e3ffa3259')
        .expect(401);
    });
  });

  describe('PATCH /api/posts/:id', () => {
    async function createPost(
      cookie: string,
      body: { content?: string; media?: ReturnType<typeof image>[] },
    ) {
      const res = await request(server)
        .post('/api/posts')
        .set('Cookie', cookie)
        .send(body)
        .expect(201);
      return postOf(res);
    }

    it('200: cambia el texto recortado, marca editedAt y se ve igual en GET y en el feed', async () => {
      const ana = await signUp('ana_lopez');
      const post = await createPost(ana.cookie, { content: 'Hola' });
      expect(post.editedAt).toBeNull();

      const res = await request(server)
        .patch(`/api/posts/${post.id}`)
        .set('Cookie', ana.cookie)
        .send({ content: '  Hola, editado  ' })
        .expect(200);
      const edited = postOf(res);
      expect(edited.content).toBe('Hola, editado');
      expect(edited.editedAt).not.toBeNull();
      expect(edited.createdAt).toBe(post.createdAt);

      const again = await request(server)
        .get(`/api/posts/${post.id}`)
        .set('Cookie', ana.cookie)
        .expect(200);
      expect(postOf(again)).toEqual(edited);

      const feed = await request(server)
        .get('/api/feed')
        .set('Cookie', ana.cookie)
        .expect(200);
      const [first] = (feed.body as { items: PostDto[] }).items;
      expect(first).toMatchObject({ id: post.id, editedAt: edited.editedAt });
    });

    it('200: con imágenes se puede quitar todo el texto, y las imágenes no cambian', async () => {
      const ana = await signUp('ana_lopez');
      const post = await createPost(ana.cookie, {
        content: 'Con foto',
        media: [image(ana.id, 'a')],
      });

      const res = await request(server)
        .patch(`/api/posts/${post.id}`)
        .set('Cookie', ana.cookie)
        .send({ content: '   ' })
        .expect(200);
      expect(postOf(res).content).toBeNull();
      expect(postOf(res).media).toEqual(post.media);
    });

    it('400 si quedaría sin texto ni imágenes, o el texto pasa de 2000 (RN03)', async () => {
      const ana = await signUp('ana_lopez');
      const post = await createPost(ana.cookie, { content: 'Solo texto' });

      const empty = await request(server)
        .patch(`/api/posts/${post.id}`)
        .set('Cookie', ana.cookie)
        .send({ content: '' })
        .expect(400);
      expect(ruleOf(empty, 'content')).toBe('contentOrMedia');

      const long = await request(server)
        .patch(`/api/posts/${post.id}`)
        .set('Cookie', ana.cookie)
        .send({ content: 'a'.repeat(2001) })
        .expect(400);
      expect(ruleOf(long, 'content')).toBe('maxLength');

      const unchanged = await prisma.post.findUniqueOrThrow({
        where: { id: post.id },
      });
      expect(unchanged.content).toBe('Solo texto');
      expect(unchanged.editedAt).toBeNull();
    });

    it('400 si intenta cambiar las imágenes u otro campo, o el id no es un UUID', async () => {
      const ana = await signUp('ana_lopez');
      const post = await createPost(ana.cookie, { content: 'Hola' });

      await request(server)
        .patch(`/api/posts/${post.id}`)
        .set('Cookie', ana.cookie)
        .send({ content: 'Hola', media: [image(ana.id, 'b')] })
        .expect(400);
      await request(server)
        .patch('/api/posts/no-es-uuid')
        .set('Cookie', ana.cookie)
        .send({ content: 'Hola' })
        .expect(400);
    });

    it('403 si la publicación es de otro usuario, sin cambiarla (RN04)', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const post = await createPost(ana.cookie, { content: 'De Ana' });

      await request(server)
        .patch(`/api/posts/${post.id}`)
        .set('Cookie', beto.cookie)
        .send({ content: 'Lo cambió Beto' })
        .expect(403);

      const unchanged = await prisma.post.findUniqueOrThrow({
        where: { id: post.id },
      });
      expect(unchanged.content).toBe('De Ana');
      expect(unchanged.editedAt).toBeNull();
    });

    it('404 si no existe o fue eliminada', async () => {
      const ana = await signUp('ana_lopez');
      const post = await createPost(ana.cookie, { content: 'Hola' });
      await request(server)
        .delete(`/api/posts/${post.id}`)
        .set('Cookie', ana.cookie)
        .expect(204);

      await request(server)
        .patch(`/api/posts/${post.id}`)
        .set('Cookie', ana.cookie)
        .send({ content: 'Tarde' })
        .expect(404);
      await request(server)
        .patch('/api/posts/00000000-0000-7000-8000-000000000000')
        .set('Cookie', ana.cookie)
        .send({ content: 'Nada' })
        .expect(404);
    });

    it('401 sin sesión', async () => {
      await request(server)
        .patch('/api/posts/00000000-0000-7000-8000-000000000000')
        .send({ content: 'Hola' })
        .expect(401);
    });
  });

  describe('DELETE /api/posts/:id', () => {
    it('204: borrado lógico, borra sus imágenes de Cloudinary y deja de verse', async () => {
      const ana = await signUp('ana_lopez');
      const created = await request(server)
        .post('/api/posts')
        .set('Cookie', ana.cookie)
        .send({ media: [image(ana.id, 'a'), image(ana.id, 'b')] })
        .expect(201);
      const { id } = postOf(created);

      await request(server)
        .delete(`/api/posts/${id}`)
        .set('Cookie', ana.cookie)
        .expect(204);

      // La fila sigue en la base, solo marcada
      const row = await prisma.post.findUnique({ where: { id } });
      expect(row?.deletedAt).not.toBeNull();
      expect(cloudinary.deleteByPublicId).toHaveBeenCalledTimes(2);
      expect(cloudinary.deleteByPublicId).toHaveBeenCalledWith(
        `users/${ana.id}/a`,
      );
      expect(cloudinary.deleteByPublicId).toHaveBeenCalledWith(
        `users/${ana.id}/b`,
      );

      await request(server)
        .get(`/api/posts/${id}`)
        .set('Cookie', ana.cookie)
        .expect(404);
      // Eliminarla otra vez ya no la encuentra
      await request(server)
        .delete(`/api/posts/${id}`)
        .set('Cookie', ana.cookie)
        .expect(404);
    });

    it('403 si la publicación es de otro usuario (RN04)', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const created = await request(server)
        .post('/api/posts')
        .set('Cookie', ana.cookie)
        .send({ content: 'De Ana', media: [image(ana.id, 'foto')] })
        .expect(201);
      const { id } = postOf(created);

      await request(server)
        .delete(`/api/posts/${id}`)
        .set('Cookie', beto.cookie)
        .expect(403);

      const row = await prisma.post.findUnique({ where: { id } });
      expect(row?.deletedAt).toBeNull();
      expect(cloudinary.deleteByPublicId).not.toHaveBeenCalled();
    });

    it('404 si no existe', async () => {
      const ana = await signUp('ana_lopez');
      await request(server)
        .delete('/api/posts/01a17fbf-5024-7141-88aa-8c7e3ffa3259')
        .set('Cookie', ana.cookie)
        .expect(404);
    });

    it('401 sin sesión', async () => {
      await request(server)
        .delete('/api/posts/01a17fbf-5024-7141-88aa-8c7e3ffa3259')
        .expect(401);
    });
  });
});
