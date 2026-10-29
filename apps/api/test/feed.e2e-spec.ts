import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request, { type Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import type { MeDto } from './../src/auth/dto/me.dto';
import type { ErrorResponseDto } from './../src/common/dto/error-response.dto';
import { configureApp } from './../src/configure-app';
import type { PostPageDto } from './../src/feed/dto/post-page.dto';
import { PrismaService } from './../src/prisma/prisma.service';
import { cookiesOf } from './utils/cookies';
import { resetDatabase } from './utils/database';

const pageOf = (res: Response) => res.body as PostPageDto;
const contentsOf = (res: Response) => pageOf(res).items.map((p) => p.content);
const meOf = (res: Response) => res.body as MeDto;
const ruleOf = (res: Response, field: string) =>
  (res.body as ErrorResponseDto).details.find((d) => d.field === field)?.rule;

describe('Feeds (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  // Otra IP por prueba para no cruzar el límite de 5 registros por minuto (ver auth.e2e-spec.ts)
  let ipCounter = 0;
  let ip: string;

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

  // Publicaciones directo en la base, con fechas separadas por un segundo para saber el orden
  async function seedPosts(
    posts: { authorId: string; content: string; deleted?: boolean }[],
  ) {
    await prisma.post.createMany({
      data: posts.map((p, i) => ({
        authorId: p.authorId,
        content: p.content,
        createdAt: new Date(Date.UTC(2026, 9, 28, 12, 0, i)),
        deletedAt: p.deleted ? new Date() : null,
      })),
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    ip = `10.0.5.${++ipCounter}`;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/feed', () => {
    it('200: propias y de seguidos, más recientes primero, sin eliminadas ni de otros (RN10)', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const carla = await signUp('carla');
      await prisma.follow.create({
        data: { followerId: ana.id, followingId: beto.id },
      });
      await seedPosts([
        { authorId: ana.id, content: 'ana 1' },
        { authorId: beto.id, content: 'beto 1' },
        { authorId: carla.id, content: 'carla, no la sigo' },
        { authorId: beto.id, content: 'beto borrada', deleted: true },
        { authorId: ana.id, content: 'ana 2' },
      ]);

      const res = await request(server)
        .get('/api/feed')
        .set('Cookie', ana.cookie)
        .expect(200);

      expect(contentsOf(res)).toEqual(['ana 2', 'beto 1', 'ana 1']);
      expect(pageOf(res).nextCursor).toBeNull();
    });

    it('200: lista vacía si no sigue a nadie ni publicó', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      await seedPosts([{ authorId: beto.id, content: 'de beto' }]);

      const res = await request(server)
        .get('/api/feed')
        .set('Cookie', ana.cookie)
        .expect(200);
      expect(pageOf(res)).toEqual({ items: [], nextCursor: null });
    });

    it('401 sin sesión', async () => {
      await request(server).get('/api/feed').expect(401);
    });
  });

  describe('GET /api/feed/explore', () => {
    it('200: todas las no eliminadas, cada una con el objeto Post y likedByMe', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      await seedPosts([
        { authorId: beto.id, content: 'beto 1' },
        { authorId: ana.id, content: 'ana 1' },
        { authorId: beto.id, content: 'borrada', deleted: true },
      ]);
      const beto1 = await prisma.post.findFirstOrThrow({
        where: { content: 'beto 1' },
      });
      await prisma.postLike.create({
        data: { userId: ana.id, postId: beto1.id },
      });

      const res = await request(server)
        .get('/api/feed/explore')
        .set('Cookie', ana.cookie)
        .expect(200);

      expect(contentsOf(res)).toEqual(['ana 1', 'beto 1']);
      const [anaPost, betoPost] = pageOf(res).items;
      expect(Object.keys(betoPost).sort()).toEqual(
        [
          'id',
          'author',
          'content',
          'media',
          'likeCount',
          'commentCount',
          'likedByMe',
          'createdAt',
        ].sort(),
      );
      expect(betoPost).toMatchObject({
        author: { id: beto.id, username: 'beto' },
        likedByMe: true,
      });
      expect(anaPost.likedByMe).toBe(false);
    });

    it('401 sin sesión', async () => {
      await request(server).get('/api/feed/explore').expect(401);
    });
  });

  describe('GET /api/users/:username/posts', () => {
    it('200: solo las del usuario, sin importar mayúsculas', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      await seedPosts([
        { authorId: beto.id, content: 'beto 1' },
        { authorId: ana.id, content: 'ana 1' },
        { authorId: beto.id, content: 'beto 2' },
        { authorId: beto.id, content: 'beto borrada', deleted: true },
      ]);

      const res = await request(server)
        .get('/api/users/BETO/posts')
        .set('Cookie', ana.cookie)
        .expect(200);
      expect(contentsOf(res)).toEqual(['beto 2', 'beto 1']);
    });

    it('404 si el usuario no existe', async () => {
      const ana = await signUp('ana_lopez');
      await request(server)
        .get('/api/users/nadie/posts')
        .set('Cookie', ana.cookie)
        .expect(404);
    });

    it('401 sin sesión', async () => {
      await request(server).get('/api/users/ana_lopez/posts').expect(401);
    });
  });

  describe('Paginación por cursor', () => {
    // 25 publicaciones dentro del mismo milisegundo, separadas por microsegundos: un cursor
    // con la precisión de un Date de JS se saltaría filas.
    async function seed25(authorId: string) {
      await prisma.$executeRaw`
        INSERT INTO posts (id, author_id, content, created_at, updated_at)
        SELECT gen_random_uuid(), ${authorId}::uuid, 'post ' || lpad(n::text, 2, '0'),
               '2026-10-28T12:00:00.123Z'::timestamptz + (n * interval '1 microsecond'),
               now()
        FROM generate_series(0, 24) AS n
      `;
    }

    const expected = Array.from(
      { length: 25 },
      (_, i) => `post ${String(24 - i).padStart(2, '0')}`,
    );

    it.each(['/api/feed', '/api/feed/explore', '/api/users/ana_lopez/posts'])(
      '200 en %s: páginas de 20, sin saltar ni repetir',
      async (path) => {
        const ana = await signUp('ana_lopez');
        await seed25(ana.id);

        const first = await request(server)
          .get(path)
          .set('Cookie', ana.cookie)
          .expect(200);
        expect(pageOf(first).items).toHaveLength(20);
        expect(pageOf(first).nextCursor).toEqual(expect.any(String));

        const second = await request(server)
          .get(path)
          .query({ cursor: pageOf(first).nextCursor })
          .set('Cookie', ana.cookie)
          .expect(200);
        expect(pageOf(second).items).toHaveLength(5);
        expect(pageOf(second).nextCursor).toBeNull();

        expect([...contentsOf(first), ...contentsOf(second)]).toEqual(expected);
      },
    );

    it('400 con un cursor que no generó la api', async () => {
      const ana = await signUp('ana_lopez');
      const res = await request(server)
        .get('/api/feed/explore')
        .query({ cursor: 'inventado' })
        .set('Cookie', ana.cookie)
        .expect(400);
      expect(ruleOf(res, 'cursor')).toBe('cursor');
    });
  });
});
