import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Socket } from 'socket.io-client';
import request, { type Response } from 'supertest';
import type { CommentDto } from './../src/comments/dto/comment.dto';
import type { ConversationDto } from './../src/conversations/dto/conversation.dto';
import type { PostPageDto } from './../src/feed/dto/post-page.dto';
import type { LikeStatusDto } from './../src/likes/dto/like-status.dto';
import type {
  NotificationPageDto,
  UnreadCountDto,
} from './../src/notifications/dto/notification.dto';
import type { PostDto } from './../src/posts/dto/post.dto';
import { PrismaService } from './../src/prisma/prisma.service';
import type {
  FeedNewEvent,
  NotificationNewEvent,
  PostCommentsEvent,
  PostLikesEvent,
} from './../src/realtime/realtime.events';
import { postRoom } from './../src/realtime/realtime.events';
import { resetDatabase } from './utils/database';
import {
  connectSocket,
  type FlowUser,
  signUp,
  startFlowApp,
  waitForEvent,
  waitUntilInRoom,
} from './utils/flow';

// Flujo crítico de contenido (S4-01, Dev 2): el recorrido completo de publicar, reaccionar,
// comentar y enterarse por notificación, como lo hace la web, y los permisos que lo cuidan.
// Cada endpoint ya tiene su e2e por separado; aquí se prueba que funcionen juntos.
describe('Flujo de contenido (e2e)', () => {
  let app: NestExpressApplication;
  let url: string;
  const sockets: Socket[] = [];

  const http = () => request(app.getHttpServer());
  const bodyOf = <T>(res: Response) => res.body as T;

  const unreadOf = async (user: FlowUser) =>
    bodyOf<UnreadCountDto>(
      await http()
        .get('/api/notifications/unread-count')
        .set('Cookie', user.cookie)
        .expect(200),
    ).count;

  const notificationsOf = async (user: FlowUser) =>
    bodyOf<NotificationPageDto>(
      await http()
        .get('/api/notifications')
        .set('Cookie', user.cookie)
        .expect(200),
    ).items;

  beforeAll(async () => {
    ({ app, url } = await startFlowApp());
  });

  beforeEach(async () => {
    await resetDatabase(app.get(PrismaService));
  });

  afterEach(() => {
    sockets.splice(0).forEach((socket) => socket.disconnect());
  });

  afterAll(async () => {
    await app.close();
  });

  it('publicar, aparecer en el feed, like, comentario, respuesta y notificaciones de punta a punta', async () => {
    const ana = await signUp(app, 'ana_lopez');
    const beto = await signUp(app, 'beto_ruiz');
    const anaSocket = await connectSocket(url, ana, sockets);
    const betoSocket = await connectSocket(url, beto, sockets);

    // 1. Beto sigue a Ana: a Ana le llega la notificación en vivo
    const followNotice = waitForEvent<NotificationNewEvent>(
      anaSocket,
      'notification:new',
    );
    await http()
      .put(`/api/users/${ana.username}/follow`)
      .set('Cookie', beto.cookie)
      .expect(200, { isFollowing: true, followerCount: 1 });
    expect(await followNotice).toMatchObject({
      type: 'follow',
      actor: { id: beto.id },
    });

    // 2. Ana publica: a Beto, que la sigue, le llega feed:new
    const feedNew = waitForEvent<FeedNewEvent>(betoSocket, 'feed:new');
    const post = bodyOf<PostDto>(
      await http()
        .post('/api/posts')
        .set('Cookie', ana.cookie)
        .send({ content: '  Primer atardecer del semestre  ' })
        .expect(201),
    );
    expect(post).toMatchObject({
      author: { id: ana.id },
      content: 'Primer atardecer del semestre',
      likeCount: 0,
      commentCount: 0,
    });
    expect(await feedNew).toMatchObject({
      postId: post.id,
      author: { id: ana.id },
    });

    // 3. La publicación aparece en el feed Siguiendo de Beto
    const feed = bodyOf<PostPageDto>(
      await http().get('/api/feed').set('Cookie', beto.cookie).expect(200),
    );
    expect(feed.items.map((p) => p.id)).toEqual([post.id]);
    expect(feed.items[0].likedByMe).toBe(false);

    // 4. Ana mira su publicación en vivo; Beto le da like
    anaSocket.emit('post:watch', { postIds: [post.id] });
    await waitUntilInRoom(app, postRoom(post.id), anaSocket);
    const liveLikes = waitForEvent<PostLikesEvent>(anaSocket, 'post:likes');
    const likeNotice = waitForEvent<NotificationNewEvent>(
      anaSocket,
      'notification:new',
    );
    const like = bodyOf<LikeStatusDto>(
      await http()
        .put(`/api/posts/${post.id}/like`)
        .set('Cookie', beto.cookie)
        .send({})
        .expect(200),
    );
    expect(like).toMatchObject({
      likeCount: 1,
      likedByMe: true,
      myReaction: 'like',
    });
    expect(await liveLikes).toMatchObject({ postId: post.id, likeCount: 1 });
    expect(await likeNotice).toMatchObject({
      type: 'like',
      postId: post.id,
      actor: { id: beto.id },
    });

    // 5. Beto comenta: el contador sube en vivo y Ana recibe la notificación con la vista previa
    const liveComments = waitForEvent<PostCommentsEvent>(
      anaSocket,
      'post:comments',
    );
    const commentNotice = waitForEvent<NotificationNewEvent>(
      anaSocket,
      'notification:new',
    );
    const comment = bodyOf<CommentDto>(
      await http()
        .post(`/api/posts/${post.id}/comments`)
        .set('Cookie', beto.cookie)
        .send({ content: 'Qué buena foto' })
        .expect(201),
    );
    expect(await liveComments).toEqual({ postId: post.id, commentCount: 1 });
    expect(await commentNotice).toMatchObject({
      type: 'comment',
      postId: post.id,
      commentId: comment.id,
      preview: 'Qué buena foto',
    });

    // 6. Ana responde el comentario: a Beto le llega reply (RN15)
    const replyNotice = waitForEvent<NotificationNewEvent>(
      betoSocket,
      'notification:new',
    );
    const reply = bodyOf<CommentDto>(
      await http()
        .post(`/api/posts/${post.id}/comments`)
        .set('Cookie', ana.cookie)
        .send({ content: 'Gracias, Beto', parentId: comment.id })
        .expect(201),
    );
    expect(reply.parentId).toBe(comment.id);
    expect(await replyNotice).toMatchObject({
      type: 'reply',
      postId: post.id,
      actor: { id: ana.id },
    });

    // 7. El detalle refleja todo: un like y dos comentarios (D05)
    const detail = bodyOf<PostDto>(
      await http()
        .get(`/api/posts/${post.id}`)
        .set('Cookie', beto.cookie)
        .expect(200),
    );
    expect(detail).toMatchObject({
      likeCount: 1,
      commentCount: 2,
      likedByMe: true,
    });
    const thread = bodyOf<{ items: CommentDto[] }>(
      await http()
        .get(`/api/posts/${post.id}/comments`)
        .set('Cookie', ana.cookie)
        .expect(200),
    );
    expect(thread.items).toMatchObject([{ id: comment.id, replyCount: 1 }]);

    // 8. Ana ve sus tres notificaciones, de la más reciente a la más antigua, y las marca leídas.
    //    Nadie recibe notificación de lo propio (RN08): la respuesta de Ana no le llega a ella.
    expect((await notificationsOf(ana)).map((n) => n.type)).toEqual([
      'comment',
      'like',
      'follow',
    ]);
    expect(await unreadOf(ana)).toBe(3);
    await http()
      .post('/api/notifications/read')
      .set('Cookie', ana.cookie)
      .send({ all: true })
      .expect(204);
    expect(await unreadOf(ana)).toBe(0);
    expect(await unreadOf(beto)).toBe(1);

    // 9. Ana borra su publicación: deja de existir para todos, y sus notificaciones ya no se
    //    muestran porque su enlace llevaría a un 404
    await http()
      .delete(`/api/posts/${post.id}`)
      .set('Cookie', ana.cookie)
      .expect(204);
    await http()
      .get(`/api/posts/${post.id}`)
      .set('Cookie', beto.cookie)
      .expect(404);
    const feedAfter = bodyOf<PostPageDto>(
      await http().get('/api/feed').set('Cookie', beto.cookie).expect(200),
    );
    expect(feedAfter.items).toEqual([]);
    expect((await notificationsOf(ana)).map((n) => n.type)).toEqual(['follow']);
    expect(await unreadOf(beto)).toBe(0);
  });

  describe('permisos', () => {
    it('403 al editar o borrar la publicación o el comentario de otro, sin cambiar nada (RN04)', async () => {
      const ana = await signUp(app, 'ana_lopez');
      const beto = await signUp(app, 'beto_ruiz');

      const post = bodyOf<PostDto>(
        await http()
          .post('/api/posts')
          .set('Cookie', ana.cookie)
          .send({ content: 'De Ana' })
          .expect(201),
      );
      const comment = bodyOf<CommentDto>(
        await http()
          .post(`/api/posts/${post.id}/comments`)
          .set('Cookie', ana.cookie)
          .send({ content: 'Comentario de Ana' })
          .expect(201),
      );

      await http()
        .patch(`/api/posts/${post.id}`)
        .set('Cookie', beto.cookie)
        .send({ content: 'Cambiado por Beto' })
        .expect(403);
      await http()
        .delete(`/api/posts/${post.id}`)
        .set('Cookie', beto.cookie)
        .expect(403);
      await http()
        .delete(`/api/comments/${comment.id}`)
        .set('Cookie', beto.cookie)
        .expect(403);

      // Todo sigue como estaba
      const detail = bodyOf<PostDto>(
        await http()
          .get(`/api/posts/${post.id}`)
          .set('Cookie', beto.cookie)
          .expect(200),
      );
      expect(detail).toMatchObject({
        content: 'De Ana',
        editedAt: null,
        commentCount: 1,
      });
      const comments = bodyOf<{ items: CommentDto[] }>(
        await http()
          .get(`/api/posts/${post.id}/comments`)
          .set('Cookie', beto.cookie)
          .expect(200),
      );
      expect(comments.items).toMatchObject([
        { id: comment.id, deleted: false },
      ]);

      // La autora sí puede: primero el comentario y después la publicación
      await http()
        .delete(`/api/comments/${comment.id}`)
        .set('Cookie', ana.cookie)
        .expect(204);
      await http()
        .delete(`/api/posts/${post.id}`)
        .set('Cookie', ana.cookie)
        .expect(204);
    });

    it('403 en un chat ajeno: no lee, no escribe, no marca leído y no entra a la sala (RN09)', async () => {
      const ana = await signUp(app, 'ana_lopez');
      const beto = await signUp(app, 'beto_ruiz');
      const carla = await signUp(app, 'carla_paz');

      const conversation = bodyOf<ConversationDto>(
        await http()
          .post('/api/conversations')
          .set('Cookie', ana.cookie)
          .send({ username: beto.username })
          .expect(201),
      );
      await http()
        .post(`/api/conversations/${conversation.id}/messages`)
        .set('Cookie', ana.cookie)
        .send({ content: 'Solo para Beto' })
        .expect(201);

      const base = `/api/conversations/${conversation.id}`;
      await http()
        .get(`${base}/messages`)
        .set('Cookie', carla.cookie)
        .expect(403);
      await http()
        .post(`${base}/messages`)
        .set('Cookie', carla.cookie)
        .send({ content: 'Me meto' })
        .expect(403);
      await http().post(`${base}/read`).set('Cookie', carla.cookie).expect(403);

      // Tampoco por Socket.io
      const carlaSocket = await connectSocket(url, carla, sockets);
      const ack: unknown = await carlaSocket.emitWithAck('conversation:join', {
        conversationId: conversation.id,
      });
      expect(ack).toEqual({ ok: false, error: 'forbidden' });

      // La conversación no aparece en su bandeja y el mensaje intruso no se guardó
      const inbox = bodyOf<ConversationDto[]>(
        await http()
          .get('/api/conversations')
          .set('Cookie', carla.cookie)
          .expect(200),
      );
      expect(inbox).toEqual([]);
      const messages = bodyOf<{ items: { content: string }[] }>(
        await http()
          .get(`${base}/messages`)
          .set('Cookie', beto.cookie)
          .expect(200),
      );
      expect(messages.items.map((m) => m.content)).toEqual(['Solo para Beto']);
    });
  });
});
