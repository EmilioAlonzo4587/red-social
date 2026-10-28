import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request, { type Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import type { MeDto } from './../src/auth/dto/me.dto';
import type { ErrorResponseDto } from './../src/common/dto/error-response.dto';
import { configureApp } from './../src/configure-app';
import { DomainEvents } from './../src/events/domain-events.service';
import type { FollowStatusDto } from './../src/follows/dto/follow-status.dto';
import type { UserSummaryPageDto } from './../src/follows/dto/user-summary-page.dto';
import { PrismaService } from './../src/prisma/prisma.service';
import { cookiesOf } from './utils/cookies';
import { resetDatabase } from './utils/database';

// supertest deja el cuerpo como any: se le pone el tipo que promete el contrato
const statusOf = (res: Response) => res.body as FollowStatusDto;
const pageOf = (res: Response) => res.body as UserSummaryPageDto;
const ruleOf = (res: Response, field: string) =>
  (res.body as ErrorResponseDto).details.find((d) => d.field === field)?.rule;

describe('Seguimiento (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  let emit: jest.SpyInstance;
  // Otra IP por prueba para no cruzar el límite de 5 registros por minuto (ver auth.e2e-spec.ts)
  let ipCounter = 0;
  let ip: string;

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
      id: (res.body as MeDto).id,
      cookie: `access_token=${cookiesOf(res).access_token.value}`,
    };
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
    emit = jest.spyOn(app.get(DomainEvents), 'emit');
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    emit.mockClear();
    ip = `10.0.2.${++ipCounter}`;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('PUT /api/users/:username/follow', () => {
    it('200: sigue, emite follow.created una vez y repetir no duplica (RN06)', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');

      const first = await request(server)
        .put('/api/users/beto/follow')
        .set('Cookie', ana.cookie)
        .expect(200);
      expect(statusOf(first)).toEqual({ isFollowing: true, followerCount: 1 });

      const again = await request(server)
        .put('/api/users/BETO/follow')
        .set('Cookie', ana.cookie)
        .expect(200);
      expect(statusOf(again)).toEqual({ isFollowing: true, followerCount: 1 });

      expect(await prisma.follow.count()).toBe(1);
      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('follow.created', {
        followerId: ana.id,
        followingId: beto.id,
      });

      // El perfil de S1-05 refleja el seguimiento
      const profile = await request(server)
        .get('/api/users/beto')
        .set('Cookie', ana.cookie)
        .expect(200);
      expect(profile.body).toMatchObject({
        isFollowing: true,
        followerCount: 1,
      });
    });

    it('400 al seguirse a sí mismo (RN06)', async () => {
      const ana = await signUp('ana_lopez');
      await request(server)
        .put('/api/users/ana_lopez/follow')
        .set('Cookie', ana.cookie)
        .expect(400);
      expect(await prisma.follow.count()).toBe(0);
      expect(emit).not.toHaveBeenCalled();
    });

    it('404 si el usuario no existe', async () => {
      const ana = await signUp('ana_lopez');
      await request(server)
        .put('/api/users/nadie/follow')
        .set('Cookie', ana.cookie)
        .expect(404);
    });

    it('401 sin sesión', async () => {
      await request(server).put('/api/users/beto/follow').expect(401);
    });
  });

  describe('DELETE /api/users/:username/follow', () => {
    it('200: deja de seguir y repetir responde lo mismo', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const carla = await signUp('carla');
      await prisma.follow.createMany({
        data: [
          { followerId: ana.id, followingId: beto.id },
          { followerId: carla.id, followingId: beto.id },
        ],
      });

      for (let i = 0; i < 2; i++) {
        const res = await request(server)
          .delete('/api/users/beto/follow')
          .set('Cookie', ana.cookie)
          .expect(200);
        expect(statusOf(res)).toEqual({ isFollowing: false, followerCount: 1 });
      }
      // Solo se borró el seguimiento de Ana, no el de Carla
      expect(await prisma.follow.count()).toBe(1);
      expect(emit).not.toHaveBeenCalled();
    });

    it('404 si el usuario no existe', async () => {
      const ana = await signUp('ana_lopez');
      await request(server)
        .delete('/api/users/nadie/follow')
        .set('Cookie', ana.cookie)
        .expect(404);
    });

    it('401 sin sesión', async () => {
      await request(server).delete('/api/users/beto/follow').expect(401);
    });
  });

  describe('GET /api/users/:username/followers y /following', () => {
    // 25 usuarios que siguen a Beto. Las fechas difieren en microsegundos dentro del mismo
    // milisegundo: un cursor con la precisión de un Date de JS se saltaría filas.
    async function seedFollowers(betoId: string) {
      await prisma.user.createMany({
        data: Array.from({ length: 25 }, (_, i) => ({
          username: `seguidor_${String(i).padStart(2, '0')}`,
          email: `seguidor_${i}@example.com`,
          passwordHash: 'no-se-usa',
        })),
      });
      await prisma.$executeRaw`
        INSERT INTO follows (follower_id, following_id, created_at)
        SELECT u.id, ${betoId}::uuid,
               '2026-10-28T12:00:00.123Z'::timestamptz
                 + (substring(u.username from 10)::int * interval '1 microsecond')
        FROM users u WHERE u.username LIKE 'seguidor\\_%'
      `;
    }

    it('200: pagina de 20 en 20, del más reciente al más antiguo, sin saltar ni repetir', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      await seedFollowers(beto.id);

      const first = await request(server)
        .get('/api/users/beto/followers')
        .set('Cookie', ana.cookie)
        .expect(200);
      expect(pageOf(first).items).toHaveLength(20);
      expect(pageOf(first).nextCursor).toEqual(expect.any(String));
      // Exactamente los campos de UserSummary
      expect(Object.keys(pageOf(first).items[0]).sort()).toEqual(
        ['avatarPublicId', 'displayName', 'id', 'username'].sort(),
      );

      const second = await request(server)
        .get('/api/users/beto/followers')
        .query({ cursor: pageOf(first).nextCursor })
        .set('Cookie', ana.cookie)
        .expect(200);
      expect(pageOf(second).items).toHaveLength(5);
      expect(pageOf(second).nextCursor).toBeNull();

      const usernames = [...pageOf(first).items, ...pageOf(second).items].map(
        (u) => u.username,
      );
      const expected = Array.from(
        { length: 25 },
        (_, i) => `seguidor_${String(24 - i).padStart(2, '0')}`,
      );
      expect(usernames).toEqual(expected);
    });

    it('200: following lista a quienes sigue el usuario', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      await prisma.follow.create({
        data: { followerId: ana.id, followingId: beto.id },
      });

      const following = await request(server)
        .get('/api/users/ana_lopez/following')
        .set('Cookie', beto.cookie)
        .expect(200);
      expect(pageOf(following)).toEqual({
        items: [
          {
            id: beto.id,
            username: 'beto',
            displayName: null,
            avatarPublicId: null,
          },
        ],
        nextCursor: null,
      });

      const followers = await request(server)
        .get('/api/users/ana_lopez/followers')
        .set('Cookie', beto.cookie)
        .expect(200);
      expect(pageOf(followers)).toEqual({ items: [], nextCursor: null });
    });

    it('400 con un cursor que no generó la api', async () => {
      const ana = await signUp('ana_lopez');
      const res = await request(server)
        .get('/api/users/ana_lopez/followers')
        .query({ cursor: 'inventado' })
        .set('Cookie', ana.cookie)
        .expect(400);
      expect(ruleOf(res, 'cursor')).toBe('cursor');
    });

    it('404 si el usuario no existe', async () => {
      const ana = await signUp('ana_lopez');
      await request(server)
        .get('/api/users/nadie/following')
        .set('Cookie', ana.cookie)
        .expect(404);
    });

    it('401 sin sesión', async () => {
      await request(server).get('/api/users/beto/followers').expect(401);
    });
  });
});
