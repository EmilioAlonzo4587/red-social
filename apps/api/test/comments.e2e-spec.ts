import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request, { type Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import type { MeDto } from './../src/auth/dto/me.dto';
import type {
  CommentDto,
  CommentPageDto,
} from './../src/comments/dto/comment.dto';
import type { ErrorResponseDto } from './../src/common/dto/error-response.dto';
import { configureApp } from './../src/configure-app';
import { DomainEvents } from './../src/events/domain-events.service';
import { NotificationsListener } from './../src/notifications/notifications.listener';
import { PrismaService } from './../src/prisma/prisma.service';
import { cookiesOf } from './utils/cookies';
import { resetDatabase } from './utils/database';

const commentOf = (res: Response) => res.body as CommentDto;
const pageOf = (res: Response) => res.body as CommentPageDto;
const contentsOf = (res: Response) => pageOf(res).items.map((c) => c.content);
const meOf = (res: Response) => res.body as MeDto;
const ruleOf = (res: Response, field: string) =>
  (res.body as ErrorResponseDto).details.find((d) => d.field === field)?.rule;

const MISSING_ID = '01a17fbf-5024-7141-88aa-8c7e3ffa3259';

describe('Comentarios (e2e)', () => {
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

  const commentCountOf = async (id: string) =>
    (await prisma.post.findUniqueOrThrow({ where: { id } })).commentCount;

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
    ip = `10.0.7.${++ipCounter}`;
    emit.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/posts/:id/comments', () => {
    it('201: crea con el texto recortado, suma al contador y emite comment.changed', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const postId = await postBy(ana.id);

      const res = await request(server)
        .post(`/api/posts/${postId}/comments`)
        .set('Cookie', beto.cookie)
        .send({ content: '  Qué buena foto  ' })
        .expect(201);

      expect(Object.keys(res.body as object).sort()).toEqual(
        ['id', 'postId', 'author', 'content', 'createdAt'].sort(),
      );
      expect(commentOf(res)).toMatchObject({
        postId,
        content: 'Qué buena foto',
        author: {
          id: beto.id,
          username: 'beto',
          displayName: null,
          avatarPublicId: null,
        },
      });
      expect(await commentCountOf(postId)).toBe(1);
      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('comment.changed', {
        postId,
        postAuthorId: ana.id,
        actorId: beto.id,
        commentId: commentOf(res).id,
        change: 'added',
        commentCount: 1,
      });
    });

    it('400 si está vacío, son solo espacios o pasa de 1000 caracteres (RN07)', async () => {
      const ana = await signUp('ana_lopez');
      const postId = await postBy(ana.id);

      for (const body of [
        {},
        { content: '   ' },
        { content: 'a'.repeat(1001) },
      ]) {
        const res = await request(server)
          .post(`/api/posts/${postId}/comments`)
          .set('Cookie', ana.cookie)
          .send(body)
          .expect(400);
        expect(ruleOf(res, 'content')).toBeDefined();
      }
      expect(await prisma.comment.count()).toBe(0);
      expect(await commentCountOf(postId)).toBe(0);
    });

    it('201: acepta exactamente 1000 caracteres', async () => {
      const ana = await signUp('ana_lopez');
      const postId = await postBy(ana.id);
      await request(server)
        .post(`/api/posts/${postId}/comments`)
        .set('Cookie', ana.cookie)
        .send({ content: 'a'.repeat(1000) })
        .expect(201);
    });

    it('400 si intenta elegir el autor', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const postId = await postBy(ana.id);

      const res = await request(server)
        .post(`/api/posts/${postId}/comments`)
        .set('Cookie', ana.cookie)
        .send({ content: 'Hola', authorId: beto.id })
        .expect(400);
      expect(ruleOf(res, 'authorId')).toBe('whitelistValidation');
    });

    it('404 si la publicación no existe o fue eliminada', async () => {
      const ana = await signUp('ana_lopez');
      const deleted = await postBy(ana.id, true);

      for (const id of [deleted, MISSING_ID]) {
        await request(server)
          .post(`/api/posts/${id}/comments`)
          .set('Cookie', ana.cookie)
          .send({ content: 'Hola' })
          .expect(404);
      }
      expect(emit).not.toHaveBeenCalled();
    });

    it('401 sin sesión', async () => {
      await request(server)
        .post(`/api/posts/${MISSING_ID}/comments`)
        .send({ content: 'Hola' })
        .expect(401);
    });
  });

  describe('GET /api/posts/:id/comments', () => {
    it('200: del más antiguo al más reciente, sin eliminados ni de otras publicaciones', async () => {
      const ana = await signUp('ana_lopez');
      const postId = await postBy(ana.id);
      const otherId = await postBy(ana.id);
      await prisma.comment.createMany({
        data: [
          {
            postId,
            authorId: ana.id,
            content: 'segundo',
            createdAt: new Date('2026-10-28T12:00:02Z'),
          },
          {
            postId,
            authorId: ana.id,
            content: 'primero',
            createdAt: new Date('2026-10-28T12:00:01Z'),
          },
          {
            postId,
            authorId: ana.id,
            content: 'borrado',
            createdAt: new Date('2026-10-28T12:00:03Z'),
            deletedAt: new Date(),
          },
          {
            postId: otherId,
            authorId: ana.id,
            content: 'de otra',
            createdAt: new Date('2026-10-28T12:00:04Z'),
          },
        ],
      });

      const res = await request(server)
        .get(`/api/posts/${postId}/comments`)
        .set('Cookie', ana.cookie)
        .expect(200);

      expect(contentsOf(res)).toEqual(['primero', 'segundo']);
      expect(pageOf(res).nextCursor).toBeNull();
      expect(pageOf(res).items[0]).toMatchObject({
        postId,
        author: { id: ana.id, username: 'ana_lopez' },
      });
    });

    it('200: páginas de 20 sin saltar ni repetir, aunque compartan milisegundo', async () => {
      const ana = await signUp('ana_lopez');
      const postId = await postBy(ana.id);
      // 25 comentarios separados por microsegundos dentro del mismo milisegundo
      await prisma.$executeRaw`
        INSERT INTO comments (id, post_id, author_id, content, created_at)
        SELECT gen_random_uuid(), ${postId}::uuid, ${ana.id}::uuid,
               'c ' || lpad(n::text, 2, '0'),
               '2026-10-28T12:00:00.123Z'::timestamptz + (n * interval '1 microsecond')
        FROM generate_series(0, 24) AS n
      `;

      const first = await request(server)
        .get(`/api/posts/${postId}/comments`)
        .set('Cookie', ana.cookie)
        .expect(200);
      expect(pageOf(first).items).toHaveLength(20);
      expect(pageOf(first).nextCursor).toEqual(expect.any(String));

      const second = await request(server)
        .get(`/api/posts/${postId}/comments`)
        .query({ cursor: pageOf(first).nextCursor })
        .set('Cookie', ana.cookie)
        .expect(200);
      expect(pageOf(second).items).toHaveLength(5);
      expect(pageOf(second).nextCursor).toBeNull();

      expect([...contentsOf(first), ...contentsOf(second)]).toEqual(
        Array.from({ length: 25 }, (_, i) => `c ${String(i).padStart(2, '0')}`),
      );
    });

    it('400 con un cursor que no generó la api', async () => {
      const ana = await signUp('ana_lopez');
      const postId = await postBy(ana.id);
      const res = await request(server)
        .get(`/api/posts/${postId}/comments`)
        .query({ cursor: 'inventado' })
        .set('Cookie', ana.cookie)
        .expect(400);
      expect(ruleOf(res, 'cursor')).toBe('cursor');
    });

    it('404 si la publicación no existe o fue eliminada', async () => {
      const ana = await signUp('ana_lopez');
      const deleted = await postBy(ana.id, true);
      for (const id of [deleted, MISSING_ID]) {
        await request(server)
          .get(`/api/posts/${id}/comments`)
          .set('Cookie', ana.cookie)
          .expect(404);
      }
    });

    it('401 sin sesión', async () => {
      await request(server)
        .get(`/api/posts/${MISSING_ID}/comments`)
        .expect(401);
    });
  });

  describe('DELETE /api/comments/:id', () => {
    async function commentOn(postId: string, cookie: string) {
      const res = await request(server)
        .post(`/api/posts/${postId}/comments`)
        .set('Cookie', cookie)
        .send({ content: 'Hola' })
        .expect(201);
      return commentOf(res).id;
    }

    it('204: borrado lógico, resta al contador, emite y deja de listarse', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const postId = await postBy(ana.id);
      const commentId = await commentOn(postId, beto.cookie);
      emit.mockClear();

      await request(server)
        .delete(`/api/comments/${commentId}`)
        .set('Cookie', beto.cookie)
        .expect(204);

      const row = await prisma.comment.findUniqueOrThrow({
        where: { id: commentId },
      });
      expect(row.deletedAt).not.toBeNull();
      expect(await commentCountOf(postId)).toBe(0);
      expect(emit).toHaveBeenCalledWith('comment.changed', {
        postId,
        postAuthorId: ana.id,
        actorId: beto.id,
        commentId,
        change: 'removed',
        commentCount: 0,
      });

      const list = await request(server)
        .get(`/api/posts/${postId}/comments`)
        .set('Cookie', beto.cookie)
        .expect(200);
      expect(pageOf(list).items).toEqual([]);

      // Eliminarlo otra vez ya no lo encuentra ni resta de nuevo
      await request(server)
        .delete(`/api/comments/${commentId}`)
        .set('Cookie', beto.cookie)
        .expect(404);
      expect(await commentCountOf(postId)).toBe(0);
    });

    it('403 si el comentario es de otro usuario, aunque la publicación sea mía (RN04)', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const postId = await postBy(ana.id);
      const commentId = await commentOn(postId, beto.cookie);
      emit.mockClear();

      await request(server)
        .delete(`/api/comments/${commentId}`)
        .set('Cookie', ana.cookie)
        .expect(403);

      const row = await prisma.comment.findUniqueOrThrow({
        where: { id: commentId },
      });
      expect(row.deletedAt).toBeNull();
      expect(await commentCountOf(postId)).toBe(1);
      expect(emit).not.toHaveBeenCalled();
    });

    it('404 si no existe', async () => {
      const ana = await signUp('ana_lopez');
      await request(server)
        .delete(`/api/comments/${MISSING_ID}`)
        .set('Cookie', ana.cookie)
        .expect(404);
    });

    it('400 si el id no es un UUID', async () => {
      const ana = await signUp('ana_lopez');
      const res = await request(server)
        .delete('/api/comments/no-es-uuid')
        .set('Cookie', ana.cookie)
        .expect(400);
      expect(ruleOf(res, 'id')).toBe('isUuid');
    });

    it('401 sin sesión', async () => {
      await request(server).delete(`/api/comments/${MISSING_ID}`).expect(401);
    });
  });
});
