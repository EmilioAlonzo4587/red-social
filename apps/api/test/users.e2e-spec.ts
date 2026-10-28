import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request, { type Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import type { MeDto } from './../src/auth/dto/me.dto';
import type { ErrorResponseDto } from './../src/common/dto/error-response.dto';
import { configureApp } from './../src/configure-app';
import { CloudinaryService } from './../src/media/cloudinary.service';
import { PrismaService } from './../src/prisma/prisma.service';
import type { ProfileDto } from './../src/users/dto/profile.dto';
import { cookiesOf } from './utils/cookies';
import { resetDatabase } from './utils/database';

// supertest deja el cuerpo como any: se le pone el tipo que promete el contrato
const profileOf = (res: Response) => res.body as ProfileDto;
const meOf = (res: Response) => res.body as MeDto;
const ruleOf = (res: Response, field: string) =>
  (res.body as ErrorResponseDto).details.find((d) => d.field === field)?.rule;

describe('Usuarios (e2e)', () => {
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

  // Registra un usuario y devuelve su id y la cookie de sesión lista para .set('Cookie', ...)
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
    ip = `10.0.1.${++ipCounter}`;
    cloudinary.deleteByPublicId.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/users/:username', () => {
    it('200: perfil propio con contadores en cero y sin correo', async () => {
      const ana = await signUp('ana_lopez');

      const res = await request(server)
        .get('/api/users/ana_lopez')
        .set('Cookie', ana.cookie)
        .expect(200);

      expect(Object.keys(res.body as object).sort()).toEqual(
        [
          'id',
          'username',
          'displayName',
          'avatarPublicId',
          'bio',
          'createdAt',
          'postCount',
          'followerCount',
          'followingCount',
          'isFollowing',
        ].sort(),
      );
      expect(profileOf(res)).toMatchObject({
        id: ana.id,
        username: 'ana_lopez',
        postCount: 0,
        followerCount: 0,
        followingCount: 0,
        isFollowing: false,
      });
    });

    it('200: cuenta seguidores, seguidos y publicaciones no eliminadas, e indica si lo sigo', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const carla = await signUp('carla');
      // Seguimientos y publicaciones directo en la base: sus endpoints llegan en S2-04 y S2-06
      await prisma.follow.createMany({
        data: [
          { followerId: ana.id, followingId: beto.id },
          { followerId: carla.id, followingId: beto.id },
          { followerId: beto.id, followingId: ana.id },
        ],
      });
      await prisma.post.createMany({
        data: [
          { authorId: beto.id, content: 'uno' },
          { authorId: beto.id, content: 'dos' },
          { authorId: beto.id, content: 'borrada', deletedAt: new Date() },
          { authorId: ana.id, content: 'de otra persona' },
        ],
      });

      // Mayúsculas distintas: username es citext (RN01)
      const res = await request(server)
        .get('/api/users/BETO')
        .set('Cookie', ana.cookie)
        .expect(200);
      expect(profileOf(res)).toMatchObject({
        username: 'beto',
        postCount: 2,
        followerCount: 2,
        followingCount: 1,
        isFollowing: true,
      });

      // Carla no sigue a Ana
      const other = await request(server)
        .get('/api/users/ana_lopez')
        .set('Cookie', carla.cookie)
        .expect(200);
      expect(profileOf(other).isFollowing).toBe(false);
    });

    it('404 si el usuario no existe', async () => {
      const ana = await signUp('ana_lopez');
      await request(server)
        .get('/api/users/nadie')
        .set('Cookie', ana.cookie)
        .expect(404);
    });

    it('401 sin sesión', async () => {
      await request(server).get('/api/users/ana_lopez').expect(401);
    });
  });

  describe('PATCH /api/users/me', () => {
    it('200: cambia nombre visible y biografía (recortados) y devuelve Me', async () => {
      const ana = await signUp('ana_lopez');

      const res = await request(server)
        .patch('/api/users/me')
        .set('Cookie', ana.cookie)
        .send({ displayName: '  Ana López  ', bio: 'Fotografía y café' })
        .expect(200);
      expect(meOf(res)).toMatchObject({
        id: ana.id,
        email: 'ana_lopez@example.com',
        displayName: 'Ana López',
        bio: 'Fotografía y café',
      });

      const me = await request(server)
        .get('/api/auth/me')
        .set('Cookie', ana.cookie)
        .expect(200);
      expect(meOf(me).displayName).toBe('Ana López');
    });

    it('200: un campo que falta no cambia; null o solo espacios lo borran', async () => {
      const ana = await signUp('ana_lopez');
      await request(server)
        .patch('/api/users/me')
        .set('Cookie', ana.cookie)
        .send({ displayName: 'Ana', bio: 'Hola' })
        .expect(200);

      const onlyBio = await request(server)
        .patch('/api/users/me')
        .set('Cookie', ana.cookie)
        .send({ bio: null })
        .expect(200);
      expect(meOf(onlyBio)).toMatchObject({ displayName: 'Ana', bio: null });

      const blank = await request(server)
        .patch('/api/users/me')
        .set('Cookie', ana.cookie)
        .send({ displayName: '   ' })
        .expect(200);
      expect(meOf(blank).displayName).toBeNull();
    });

    it('400 si displayName pasa de 80 o bio de 300', async () => {
      const ana = await signUp('ana_lopez');
      const res = await request(server)
        .patch('/api/users/me')
        .set('Cookie', ana.cookie)
        .send({ displayName: 'a'.repeat(81), bio: 'b'.repeat(301) })
        .expect(400);
      expect(ruleOf(res, 'displayName')).toBe('maxLength');
      expect(ruleOf(res, 'bio')).toBe('maxLength');
    });

    it('400 si intenta cambiar un campo no permitido, como username', async () => {
      const ana = await signUp('ana_lopez');
      const res = await request(server)
        .patch('/api/users/me')
        .set('Cookie', ana.cookie)
        .send({ username: 'otro' })
        .expect(400);
      expect(ruleOf(res, 'username')).toBe('whitelistValidation');
    });

    it('400 si un campo no es texto', async () => {
      const ana = await signUp('ana_lopez');
      const res = await request(server)
        .patch('/api/users/me')
        .set('Cookie', ana.cookie)
        .send({ bio: 123 })
        .expect(400);
      // class-validator reporta primero el último decorador (maxLength); basta con que falle bio
      expect(ruleOf(res, 'bio')).toBeDefined();
    });

    it('401 sin sesión', async () => {
      await request(server)
        .patch('/api/users/me')
        .send({ bio: 'Hola' })
        .expect(401);
    });

    it('200: acepta un avatarPublicId propio y lo guarda', async () => {
      const ana = await signUp('ana_lopez');
      const publicId = `users/${ana.id}/foto1`;

      const res = await request(server)
        .patch('/api/users/me')
        .set('Cookie', ana.cookie)
        .send({ avatarPublicId: publicId })
        .expect(200);

      expect(meOf(res).avatarPublicId).toBe(publicId);
    });

    it('200: borra el avatar anterior en Cloudinary cuando cambia', async () => {
      const ana = await signUp('ana_lopez');
      const anterior = `users/${ana.id}/viejo`;
      const nuevo = `users/${ana.id}/nuevo`;

      await request(server)
        .patch('/api/users/me')
        .set('Cookie', ana.cookie)
        .send({ avatarPublicId: anterior })
        .expect(200);
      await request(server)
        .patch('/api/users/me')
        .set('Cookie', ana.cookie)
        .send({ avatarPublicId: nuevo })
        .expect(200);

      expect(cloudinary.deleteByPublicId).toHaveBeenCalledWith(anterior);
    });

    it('200: avatarPublicId null quita la foto', async () => {
      const ana = await signUp('ana_lopez');
      await request(server)
        .patch('/api/users/me')
        .set('Cookie', ana.cookie)
        .send({ avatarPublicId: `users/${ana.id}/foto1` })
        .expect(200);

      const res = await request(server)
        .patch('/api/users/me')
        .set('Cookie', ana.cookie)
        .send({ avatarPublicId: null })
        .expect(200);

      expect(meOf(res).avatarPublicId).toBeNull();
    });

    it('400 si el avatarPublicId no es del usuario con sesión (RN04)', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');

      const res = await request(server)
        .patch('/api/users/me')
        .set('Cookie', ana.cookie)
        .send({ avatarPublicId: `users/${beto.id}/foto-de-beto` })
        .expect(400);

      expect(ruleOf(res, 'avatarPublicId')).toBe('ownership');
      expect(cloudinary.deleteByPublicId).not.toHaveBeenCalled();
    });

    it('400 si avatarPublicId es una cadena vacía', async () => {
      const ana = await signUp('ana_lopez');
      const res = await request(server)
        .patch('/api/users/me')
        .set('Cookie', ana.cookie)
        .send({ avatarPublicId: '' })
        .expect(400);
      expect(ruleOf(res, 'avatarPublicId')).toBe('ownership');
    });
  });
});
