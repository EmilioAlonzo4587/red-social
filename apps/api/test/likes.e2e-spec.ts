import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request, { type Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import type { MeDto } from './../src/auth/dto/me.dto';
import type { ErrorResponseDto } from './../src/common/dto/error-response.dto';
import { configureApp } from './../src/configure-app';
import { DomainEvents } from './../src/events/domain-events.service';
import type { LikeStatusDto } from './../src/likes/dto/like-status.dto';
import { NotificationsListener } from './../src/notifications/notifications.listener';
import type { PostDto } from './../src/posts/dto/post.dto';
import { PrismaService } from './../src/prisma/prisma.service';
import { cookiesOf } from './utils/cookies';
import { resetDatabase } from './utils/database';

const statusOf = (res: Response) => res.body as LikeStatusDto;
const meOf = (res: Response) => res.body as MeDto;
const ruleOf = (res: Response, field: string) =>
  (res.body as ErrorResponseDto).details.find((d) => d.field === field)?.rule;

const MISSING_ID = '01a17fbf-5024-7141-88aa-8c7e3ffa3259';

describe('Likes (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  let emit: jest.SpyInstance;
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

  async function postBy(authorId: string, deleted = false) {
    const post = await prisma.post.create({
      data: {
        authorId,
        content: 'Hola',
        deletedAt: deleted ? new Date() : null,
      },
    });
    return post.id;
  }

  const likeCountOf = async (id: string) =>
    (await prisma.post.findUniqueOrThrow({ where: { id } })).likeCount;

  beforeAll(async () => {
    // Sin el listener de notificaciones: escribiría y emitiría notification.created después de
    // responder, y las cuentas de emit de este archivo dependerían de cuándo termina.
    // Las notificaciones se prueban en notifications.e2e-spec.ts.
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(NotificationsListener)
      .useValue({})
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    emit = jest.spyOn(app.get(DomainEvents), 'emit');
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    ip = `10.0.6.${++ipCounter}`;
    emit.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('PUT /api/posts/:id/like', () => {
    it('200: suma uno, emite like.changed y el Post lo refleja', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const id = await postBy(ana.id);

      const res = await request(server)
        .put(`/api/posts/${id}/like`)
        .set('Cookie', beto.cookie)
        .expect(200);

      expect(statusOf(res)).toEqual({
        likeCount: 1,
        likedByMe: true,
        myReaction: 'like',
        topReactions: ['like'],
      });
      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('like.changed', {
        postId: id,
        postAuthorId: ana.id,
        actorId: beto.id,
        change: 'added',
        likeCount: 1,
        topReactions: ['like'],
      });

      const post = await request(server)
        .get(`/api/posts/${id}`)
        .set('Cookie', beto.cookie)
        .expect(200);
      expect(post.body as PostDto).toMatchObject({
        likeCount: 1,
        likedByMe: true,
      });
    });

    it('200: dos likes del mismo usuario cuentan uno y el segundo no emite (RN05)', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const id = await postBy(ana.id);

      for (let i = 0; i < 2; i++) {
        const res = await request(server)
          .put(`/api/posts/${id}/like`)
          .set('Cookie', beto.cookie)
          .expect(200);
        expect(statusOf(res)).toEqual({
          likeCount: 1,
          likedByMe: true,
          myReaction: 'like',
          topReactions: ['like'],
        });
      }

      expect(await likeCountOf(id)).toBe(1);
      expect(await prisma.postLike.count({ where: { postId: id } })).toBe(1);
      expect(emit).toHaveBeenCalledTimes(1);
    });

    it('200: dos likes al mismo tiempo del mismo usuario también cuentan uno', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const id = await postBy(ana.id);

      await Promise.all(
        [0, 1].map(() =>
          request(server)
            .put(`/api/posts/${id}/like`)
            .set('Cookie', beto.cookie)
            .expect(200),
        ),
      );

      expect(await likeCountOf(id)).toBe(1);
      expect(emit).toHaveBeenCalledTimes(1);
    });

    it('200: usuarios distintos suman cada uno', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const id = await postBy(ana.id);

      await request(server)
        .put(`/api/posts/${id}/like`)
        .set('Cookie', ana.cookie)
        .expect(200);
      const res = await request(server)
        .put(`/api/posts/${id}/like`)
        .set('Cookie', beto.cookie)
        .expect(200);

      expect(statusOf(res).likeCount).toBe(2);
      expect(await likeCountOf(id)).toBe(2);
    });

    it('404 si la publicación no existe o fue eliminada', async () => {
      const ana = await signUp('ana_lopez');
      const deleted = await postBy(ana.id, true);

      for (const id of [deleted, MISSING_ID]) {
        await request(server)
          .put(`/api/posts/${id}/like`)
          .set('Cookie', ana.cookie)
          .expect(404);
      }
      expect(await prisma.postLike.count()).toBe(0);
      expect(emit).not.toHaveBeenCalled();
    });

    it('400 si el id no es un UUID', async () => {
      const ana = await signUp('ana_lopez');
      const res = await request(server)
        .put('/api/posts/no-es-uuid/like')
        .set('Cookie', ana.cookie)
        .expect(400);
      expect(ruleOf(res, 'id')).toBe('isUuid');
    });

    it('401 sin sesión', async () => {
      await request(server).put(`/api/posts/${MISSING_ID}/like`).expect(401);
    });
  });

  describe('Reacciones (S4-12)', () => {
    const react = (id: string, cookie: string, reaction?: string) =>
      request(server)
        .put(`/api/posts/${id}/like`)
        .set('Cookie', cookie)
        .send(reaction === undefined ? {} : { reaction });

    it('200: acepta cada una de las 6 reacciones', async () => {
      const ana = await signUp('ana_lopez');
      const id = await postBy(ana.id);

      for (const reaction of ['like', 'love', 'haha', 'wow', 'sad', 'angry']) {
        const res = await react(id, ana.cookie, reaction).expect(200);
        expect(statusOf(res)).toEqual({
          likeCount: 1,
          likedByMe: true,
          myReaction: reaction,
          topReactions: [reaction],
        });
      }
    });

    it('200: cambiar de reacción no suma al total y emite changed', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const id = await postBy(ana.id);
      await react(id, beto.cookie, 'like').expect(200);
      emit.mockClear();

      const res = await react(id, beto.cookie, 'love').expect(200);

      expect(statusOf(res)).toMatchObject({
        likeCount: 1,
        myReaction: 'love',
        topReactions: ['love'],
      });
      expect(await likeCountOf(id)).toBe(1);
      expect(await prisma.postLike.count({ where: { postId: id } })).toBe(1);
      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('like.changed', {
        postId: id,
        postAuthorId: ana.id,
        actorId: beto.id,
        change: 'changed',
        likeCount: 1,
        topReactions: ['love'],
      });
    });

    it('200: repetir la misma reacción no cambia nada ni emite', async () => {
      const ana = await signUp('ana_lopez');
      const id = await postBy(ana.id);
      await react(id, ana.cookie, 'wow').expect(200);
      emit.mockClear();

      const res = await react(id, ana.cookie, 'wow').expect(200);

      expect(statusOf(res)).toMatchObject({ likeCount: 1, myReaction: 'wow' });
      expect(emit).not.toHaveBeenCalled();
    });

    it('200: las más usadas, hasta 3, y Post muestra mi reacción', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const carla = await signUp('carla');
      const diego = await signUp('diego');
      const elena = await signUp('elena');
      const id = await postBy(ana.id);
      await react(id, ana.cookie, 'sad').expect(200);
      await react(id, beto.cookie, 'sad').expect(200);
      await react(id, carla.cookie, 'love').expect(200);
      await react(id, diego.cookie, 'like').expect(200);
      await react(id, elena.cookie, 'wow').expect(200);

      const post = await request(server)
        .get(`/api/posts/${id}`)
        .set('Cookie', carla.cookie)
        .expect(200);
      expect(post.body as PostDto).toMatchObject({
        likeCount: 5,
        likedByMe: true,
        myReaction: 'love',
        // sad gana con 2; like y love empatan y siguen el orden de la lista; wow queda fuera
        topReactions: ['sad', 'like', 'love'],
      });

      const feed = await request(server)
        .get('/api/feed/explore')
        .set('Cookie', beto.cookie)
        .expect(200);
      expect((feed.body as { items: PostDto[] }).items[0]).toMatchObject({
        myReaction: 'sad',
        topReactions: ['sad', 'like', 'love'],
      });
    });

    it('400 si la reacción no existe, sin guardar nada', async () => {
      const ana = await signUp('ana_lopez');
      const id = await postBy(ana.id);

      const res = await react(id, ana.cookie, 'dislike').expect(400);

      expect(ruleOf(res, 'reaction')).toBe('isIn');
      expect(await prisma.postLike.count()).toBe(0);
      expect(emit).not.toHaveBeenCalled();
    });

    it('la base rechaza una reacción fuera de la lista', async () => {
      const ana = await signUp('ana_lopez');
      const id = await postBy(ana.id);

      await expect(
        prisma.postLike.create({
          data: { userId: ana.id, postId: id, reaction: 'dislike' },
        }),
      ).rejects.toThrow();
    });
  });

  describe('DELETE /api/posts/:id/like', () => {
    it('200: resta uno, emite like.changed y repetir no cambia nada', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const id = await postBy(ana.id);
      await request(server)
        .put(`/api/posts/${id}/like`)
        .set('Cookie', beto.cookie)
        .expect(200);
      emit.mockClear();

      for (let i = 0; i < 2; i++) {
        const res = await request(server)
          .delete(`/api/posts/${id}/like`)
          .set('Cookie', beto.cookie)
          .expect(200);
        expect(statusOf(res)).toEqual({
          likeCount: 0,
          likedByMe: false,
          myReaction: null,
          topReactions: [],
        });
      }

      expect(await likeCountOf(id)).toBe(0);
      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('like.changed', {
        postId: id,
        postAuthorId: ana.id,
        actorId: beto.id,
        change: 'removed',
        likeCount: 0,
        topReactions: [],
      });
    });

    it('200: quitar un like que no di no baja el contador de los demás', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const id = await postBy(ana.id);
      await request(server)
        .put(`/api/posts/${id}/like`)
        .set('Cookie', ana.cookie)
        .expect(200);

      const res = await request(server)
        .delete(`/api/posts/${id}/like`)
        .set('Cookie', beto.cookie)
        .expect(200);

      expect(statusOf(res)).toEqual({
        likeCount: 1,
        likedByMe: false,
        myReaction: null,
        topReactions: ['like'],
      });
      expect(await likeCountOf(id)).toBe(1);
    });

    it('404 si la publicación no existe', async () => {
      const ana = await signUp('ana_lopez');
      await request(server)
        .delete(`/api/posts/${MISSING_ID}/like`)
        .set('Cookie', ana.cookie)
        .expect(404);
    });

    it('401 sin sesión', async () => {
      await request(server).delete(`/api/posts/${MISSING_ID}/like`).expect(401);
    });
  });
});
