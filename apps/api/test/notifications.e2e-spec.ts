import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request, { type Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import type { MeDto } from './../src/auth/dto/me.dto';
import type { ErrorResponseDto } from './../src/common/dto/error-response.dto';
import { configureApp } from './../src/configure-app';
import { DomainEvents } from './../src/events/domain-events.service';
import type {
  NotificationPageDto,
  UnreadCountDto,
} from './../src/notifications/dto/notification.dto';
import { PrismaService } from './../src/prisma/prisma.service';
import { cookiesOf } from './utils/cookies';
import { resetDatabase } from './utils/database';

const pageOf = (res: Response) => res.body as NotificationPageDto;
const meOf = (res: Response) => res.body as MeDto;
const ruleOf = (res: Response, field: string) =>
  (res.body as ErrorResponseDto).details.find((d) => d.field === field)?.rule;

describe('Notificaciones (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  let events: DomainEvents;
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

  async function postBy(authorId: string) {
    const post = await prisma.post.create({
      data: { authorId, content: 'Hola' },
    });
    return post.id;
  }

  // Los listeners corren después de que la petición respondió: se espera a que la base tenga
  // las notificaciones de ese usuario en vez de suponer que ya están.
  async function waitForNotifications(recipientId: string, count: number) {
    for (let i = 0; i < 100; i++) {
      const found = await prisma.notification.count({ where: { recipientId } });
      if (found >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`${recipientId} no llegó a ${count} notificaciones`);
  }

  const listOf = (cookie: string, cursor?: string) =>
    request(server)
      .get('/api/notifications')
      .query(cursor ? { cursor } : {})
      .set('Cookie', cookie)
      .expect(200);

  const unreadOf = async (cookie: string) =>
    (
      (
        await request(server)
          .get('/api/notifications/unread-count')
          .set('Cookie', cookie)
          .expect(200)
      ).body as UnreadCountDto
    ).count;

  function sendMessage(senderId: string, recipientId: string) {
    events.emit('message.created', {
      recipientId,
      message: {
        id: '01a17fbf-5024-7141-88aa-8c7e3ffa3259',
        conversationId: '01a17fbf-5024-7141-88aa-8c7e3ffa3260',
        senderId,
        content: 'Hola',
        createdAt: new Date(),
      },
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
    events = app.get(DomainEvents);
    emit = jest.spyOn(events, 'emit');
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    ip = `10.0.9.${++ipCounter}`;
    emit.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Listeners', () => {
    it('like: notifica al autor, emite notification.created y suma al contador', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const postId = await postBy(ana.id);

      await request(server)
        .put(`/api/posts/${postId}/like`)
        .set('Cookie', beto.cookie)
        .expect(200);
      await waitForNotifications(ana.id, 1);

      const res = await listOf(ana.cookie);
      expect(pageOf(res).nextCursor).toBeNull();
      expect(pageOf(res).items).toHaveLength(1);
      const [notification] = pageOf(res).items;
      expect(Object.keys(notification).sort()).toEqual(
        [
          'id',
          'type',
          'actor',
          'postId',
          'commentId',
          'preview',
          'reaction',
          'read',
          'createdAt',
        ].sort(),
      );
      expect(notification).toMatchObject({
        type: 'like',
        actor: {
          id: beto.id,
          username: 'beto',
          displayName: null,
          avatarPublicId: null,
        },
        postId,
        commentId: null,
        preview: null,
        read: false,
      });
      expect(await unreadOf(ana.cookie)).toBe(1);
      expect(emit).toHaveBeenCalledWith('notification.created', {
        recipientId: ana.id,
        notification: expect.objectContaining({
          id: notification.id,
          type: 'like',
          preview: null,
        }) as unknown,
      });

      // Beto no recibe nada por su propio like
      expect(pageOf(await listOf(beto.cookie)).items).toEqual([]);

      // S4-11: quitar el like y volver a darlo no crea una segunda notificación
      await request(server)
        .delete(`/api/posts/${postId}/like`)
        .set('Cookie', beto.cookie)
        .expect(200);
      await request(server)
        .put(`/api/posts/${postId}/like`)
        .set('Cookie', beto.cookie)
        .expect(200);
      // Un follow final confirma que los listeners anteriores ya terminaron
      await request(server)
        .put('/api/users/ana_lopez/follow')
        .set('Cookie', beto.cookie)
        .expect(200);
      await waitForNotifications(ana.id, 2);
      expect(
        pageOf(await listOf(ana.cookie)).items.filter((n) => n.type === 'like'),
      ).toHaveLength(1);
    });

    it('like: la lista muestra la reacción actual y cambiarla no crea otra notificación', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const postId = await postBy(ana.id);
      const react = (reaction: string) =>
        request(server)
          .put(`/api/posts/${postId}/like`)
          .set('Cookie', beto.cookie)
          .send({ reaction })
          .expect(200);

      await react('love');
      await waitForNotifications(ana.id, 1);
      expect(emit).toHaveBeenCalledWith('notification.created', {
        recipientId: ana.id,
        notification: expect.objectContaining({
          type: 'like',
          reaction: 'love',
        }) as unknown,
      });
      expect(pageOf(await listOf(ana.cookie)).items[0].reaction).toBe('love');

      await react('sad');
      // Un follow final confirma que los listeners anteriores ya terminaron
      await request(server)
        .put('/api/users/ana_lopez/follow')
        .set('Cookie', beto.cookie)
        .expect(200);
      await waitForNotifications(ana.id, 2);
      const likes = pageOf(await listOf(ana.cookie)).items.filter(
        (n) => n.type === 'like',
      );
      expect(likes).toHaveLength(1);
      expect(likes[0].reaction).toBe('sad');

      await request(server)
        .delete(`/api/posts/${postId}/like`)
        .set('Cookie', beto.cookie)
        .expect(200);
      const afterRemove = pageOf(await listOf(ana.cookie)).items.filter(
        (n) => n.type === 'like',
      );
      expect(afterRemove[0].reaction).toBeNull();
    });

    it('comment: lleva la publicación, el comentario y su preview (~80 caracteres)', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const postId = await postBy(ana.id);

      const comment = await request(server)
        .post(`/api/posts/${postId}/comments`)
        .set('Cookie', beto.cookie)
        .send({ content: 'Qué buena foto' })
        .expect(201);
      await waitForNotifications(ana.id, 1);

      expect(pageOf(await listOf(ana.cookie)).items).toMatchObject([
        {
          type: 'comment',
          actor: { id: beto.id },
          postId,
          commentId: (comment.body as { id: string }).id,
          preview: 'Qué buena foto',
        },
      ]);
    });

    it('comment: a partir del comentario 10 de la misma persona en la misma publicación ya no notifica, pero en otra sí (S4-11)', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const post1 = await postBy(ana.id);
      const post2 = await postBy(ana.id);

      for (let i = 1; i <= 11; i++) {
        await request(server)
          .post(`/api/posts/${post1}/comments`)
          .set('Cookie', beto.cookie)
          .send({ content: `Comentario ${i}` })
          .expect(201);
      }
      // Comentario en otra publicación: sí debe notificar y sirve de barrera para saber
      // que el comentario 11 de post1 ya se procesó.
      await request(server)
        .post(`/api/posts/${post2}/comments`)
        .set('Cookie', beto.cookie)
        .send({ content: 'En otra publicación' })
        .expect(201);

      await waitForNotifications(ana.id, 11);
      const items = pageOf(await listOf(ana.cookie)).items;
      expect(items.filter((n) => n.postId === post1)).toHaveLength(10);
      expect(items.filter((n) => n.postId === post2)).toHaveLength(1);
    });

    it('follow: una sola aunque el PUT se repita (RN06)', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');

      for (let i = 0; i < 2; i++) {
        await request(server)
          .put('/api/users/ana_lopez/follow')
          .set('Cookie', beto.cookie)
          .expect(200);
      }
      await waitForNotifications(ana.id, 1);

      expect(pageOf(await listOf(ana.cookie)).items).toMatchObject([
        {
          type: 'follow',
          actor: { id: beto.id },
          postId: null,
          commentId: null,
        },
      ]);
    });

    it('nunca por una acción sobre uno mismo (RN08)', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const postId = await postBy(ana.id);

      await request(server)
        .put(`/api/posts/${postId}/like`)
        .set('Cookie', ana.cookie)
        .expect(200);
      await request(server)
        .post(`/api/posts/${postId}/comments`)
        .set('Cookie', ana.cookie)
        .send({ content: 'Mi propia foto' })
        .expect(201);
      // Una notificación ajena al final: cuando llega, los listeners anteriores ya terminaron
      await request(server)
        .put('/api/users/ana_lopez/follow')
        .set('Cookie', beto.cookie)
        .expect(200);
      await waitForNotifications(ana.id, 1);

      expect(pageOf(await listOf(ana.cookie)).items).toMatchObject([
        { type: 'follow' },
      ]);
    });

    it('message: una sin leer por remitente; leída, el siguiente mensaje crea otra', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');

      sendMessage(beto.id, ana.id);
      await waitForNotifications(ana.id, 1);
      sendMessage(beto.id, ana.id);
      // Igual que en RN08: un follow al final confirma que el segundo mensaje ya se procesó
      await request(server)
        .put('/api/users/ana_lopez/follow')
        .set('Cookie', beto.cookie)
        .expect(200);
      await waitForNotifications(ana.id, 2);

      const types = (res: Response) => pageOf(res).items.map((n) => n.type);
      expect(types(await listOf(ana.cookie))).toEqual(['follow', 'message']);

      await request(server)
        .post('/api/notifications/read')
        .set('Cookie', ana.cookie)
        .send({ all: true })
        .expect(204);
      sendMessage(beto.id, ana.id);
      await waitForNotifications(ana.id, 3);
      expect(types(await listOf(ana.cookie))).toEqual([
        'message',
        'follow',
        'message',
      ]);
    });

    it('message: calcula preview con el último mensaje del remitente en GET /api/notifications y notification.created (S4-11)', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');

      const convRes = await request(server)
        .post('/api/conversations')
        .set('Cookie', beto.cookie)
        .send({ username: 'ana_lopez' })
        .expect(201);
      const convId = (convRes.body as { id: string }).id;

      await request(server)
        .post(`/api/conversations/${convId}/messages`)
        .set('Cookie', beto.cookie)
        .send({ content: 'Primer mensaje de Beto' })
        .expect(201);
      await waitForNotifications(ana.id, 1);

      expect(emit).toHaveBeenCalledWith('notification.created', {
        recipientId: ana.id,
        notification: expect.objectContaining({
          type: 'message',
          preview: 'Primer mensaje de Beto',
        }) as unknown,
      });

      // Segundo mensaje mientras la notificación sigue sin leer: no crea otra fila, pero al
      // leer GET /api/notifications muestra el preview del último mensaje del remitente.
      await request(server)
        .post(`/api/conversations/${convId}/messages`)
        .set('Cookie', beto.cookie)
        .send({ content: 'Último mensaje de Beto' })
        .expect(201);

      const items = pageOf(await listOf(ana.cookie)).items;
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        type: 'message',
        preview: 'Último mensaje de Beto',
      });

      // Al leer la conversación en /chat, un nuevo mensaje vuelve a crear otra notificación
      await request(server)
        .post(`/api/conversations/${convId}/read`)
        .set('Cookie', ana.cookie)
        .expect(204);
      await request(server)
        .post(`/api/conversations/${convId}/messages`)
        .set('Cookie', beto.cookie)
        .send({ content: 'Mensaje después de leer el chat' })
        .expect(201);
      await waitForNotifications(ana.id, 2);
      expect(pageOf(await listOf(ana.cookie)).items).toHaveLength(2);
    });
  });

  describe('GET /api/notifications', () => {
    // 25 notificaciones creadas en la misma sentencia: comparten created_at y el orden
    // depende del desempate por id
    async function seedNotifications(recipientId: string, actorId: string) {
      await prisma.notification.createMany({
        data: Array.from({ length: 25 }, () => ({
          type: 'follow',
          recipientId,
          actorId,
        })),
      });
    }

    it('200: pagina de 20 en 20, de la más reciente a la más antigua, sin saltar ni repetir', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      await seedNotifications(ana.id, beto.id);
      const expected = (
        await prisma.notification.findMany({
          where: { recipientId: ana.id },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { id: true },
        })
      ).map((n) => n.id);

      const first = await listOf(ana.cookie);
      expect(pageOf(first).items).toHaveLength(20);
      expect(pageOf(first).nextCursor).toEqual(expect.any(String));
      const second = await listOf(ana.cookie, pageOf(first).nextCursor!);
      expect(pageOf(second).items).toHaveLength(5);
      expect(pageOf(second).nextCursor).toBeNull();

      expect(
        [...pageOf(first).items, ...pageOf(second).items].map((n) => n.id),
      ).toEqual(expected);
    });

    it('no muestra ni cuenta las de una publicación o un comentario eliminados', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const deletedPost = await postBy(ana.id);
      const livePost = await postBy(ana.id);
      const comment = await prisma.comment.create({
        data: { postId: livePost, authorId: beto.id, content: 'Hola' },
      });
      await prisma.notification.createMany({
        data: [
          {
            type: 'like',
            recipientId: ana.id,
            actorId: beto.id,
            postId: deletedPost,
          },
          {
            type: 'like',
            recipientId: ana.id,
            actorId: beto.id,
            postId: livePost,
          },
          {
            type: 'comment',
            recipientId: ana.id,
            actorId: beto.id,
            postId: livePost,
            commentId: comment.id,
          },
        ],
      });
      await prisma.post.update({
        where: { id: deletedPost },
        data: { deletedAt: new Date() },
      });
      await prisma.comment.update({
        where: { id: comment.id },
        data: { deletedAt: new Date() },
      });

      expect(pageOf(await listOf(ana.cookie)).items).toMatchObject([
        { type: 'like', postId: livePost },
      ]);
      expect(await unreadOf(ana.cookie)).toBe(1);
    });

    it('400 con un cursor que la api no generó', async () => {
      const ana = await signUp('ana_lopez');
      const res = await request(server)
        .get('/api/notifications')
        .query({ cursor: 'basura' })
        .set('Cookie', ana.cookie)
        .expect(400);
      expect(ruleOf(res, 'cursor')).toBe('cursor');
    });

    it('401 sin sesión', async () => {
      await request(server).get('/api/notifications').expect(401);
      await request(server).get('/api/notifications/unread-count').expect(401);
    });
  });

  describe('POST /api/notifications/read', () => {
    async function seed(recipientId: string, actorId: string, count: number) {
      await prisma.notification.createMany({
        data: Array.from({ length: count }, () => ({
          type: 'follow',
          recipientId,
          actorId,
        })),
      });
      return (
        await prisma.notification.findMany({
          where: { recipientId },
          select: { id: true },
        })
      ).map((n) => n.id);
    }

    it('204: ids marca solo esas y las ajenas no cambian', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const [first, second, third] = await seed(ana.id, beto.id, 3);
      const [betoOwn] = await seed(beto.id, ana.id, 1);

      await request(server)
        .post('/api/notifications/read')
        .set('Cookie', ana.cookie)
        .send({ ids: [first, second, betoOwn] })
        .expect(204);

      expect(await unreadOf(ana.cookie)).toBe(1);
      const items = pageOf(await listOf(ana.cookie)).items;
      expect(items.find((n) => n.id === third)?.read).toBe(false);
      expect(items.find((n) => n.id === first)?.read).toBe(true);
      // La de Beto sigue sin leer: Ana no puede marcarla
      expect(await unreadOf(beto.cookie)).toBe(1);
    });

    it('204: all marca todas las del usuario', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      await seed(ana.id, beto.id, 3);
      await seed(beto.id, ana.id, 1);

      await request(server)
        .post('/api/notifications/read')
        .set('Cookie', ana.cookie)
        .send({ all: true })
        .expect(204);

      expect(await unreadOf(ana.cookie)).toBe(0);
      expect(await unreadOf(beto.cookie)).toBe(1);
    });

    it('400 si falta ids o all, vienen los dos o tienen otro valor', async () => {
      const ana = await signUp('ana_lopez');
      const id = '01a17fbf-5024-7141-88aa-8c7e3ffa3259';

      for (const [body, field, rule] of [
        [{}, 'ids', 'isArray'],
        [{}, 'all', 'equals'],
        [{ ids: [] }, 'ids', 'arrayMinSize'],
        [{ ids: ['no-es-uuid'] }, 'ids', 'isUuid'],
        [{ ids: id }, 'ids', 'isArray'],
        [{ ids: Array.from({ length: 101 }, () => id) }, 'ids', 'arrayMaxSize'],
        [{ all: false }, 'all', 'equals'],
        [{ ids: [id], all: true }, 'all', 'notWith'],
        [{ all: true, extra: 1 }, 'extra', 'whitelistValidation'],
      ] as const) {
        const res = await request(server)
          .post('/api/notifications/read')
          .set('Cookie', ana.cookie)
          .send(body)
          .expect(400);
        expect(ruleOf(res, field)).toBe(rule);
      }
    });

    it('401 sin sesión', async () => {
      await request(server)
        .post('/api/notifications/read')
        .send({ all: true })
        .expect(401);
    });
  });
});
