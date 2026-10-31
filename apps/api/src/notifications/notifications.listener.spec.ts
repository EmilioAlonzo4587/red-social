import { NotificationsListener } from './notifications.listener';
import { NotificationsService } from './notifications.service';

// Qué notificación pide cada evento de dominio. Que se registren con @OnDomainEvent lo prueba
// test/notifications.e2e-spec.ts con la app completa.
describe('NotificationsListener', () => {
  const notifications = {
    notify: jest.fn(),
  };
  let listener: NotificationsListener;

  beforeEach(() => {
    jest.clearAllMocks();
    listener = new NotificationsListener(
      notifications as unknown as NotificationsService,
    );
  });

  it('like.changed added: like para el autor de la publicación', async () => {
    await listener.onLike({
      postId: 'p1',
      postAuthorId: 'ana',
      actorId: 'beto',
      change: 'added',
      likeCount: 1,
      topReactions: ['love'],
      reaction: 'love',
    });
    expect(notifications.notify).toHaveBeenCalledWith({
      type: 'like',
      recipientId: 'ana',
      actorId: 'beto',
      postId: 'p1',
      reaction: 'love',
    });
  });

  it('like.changed changed: cambiar de reacción no vuelve a notificar', async () => {
    await listener.onLike({
      postId: 'p1',
      postAuthorId: 'ana',
      actorId: 'beto',
      change: 'changed',
      likeCount: 1,
      topReactions: ['love'],
      reaction: 'love',
    });
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('like.changed removed: nada', async () => {
    await listener.onLike({
      postId: 'p1',
      postAuthorId: 'ana',
      actorId: 'beto',
      change: 'removed',
      likeCount: 0,
      topReactions: [],
      reaction: null,
    });
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('comment.changed added: comment con la publicación y el comentario', async () => {
    await listener.onComment({
      postId: 'p1',
      postAuthorId: 'ana',
      actorId: 'beto',
      commentId: 'c1',
      change: 'added',
      commentCount: 1,
      replyToAuthorId: null,
    });
    expect(notifications.notify).toHaveBeenCalledWith({
      type: 'comment',
      recipientId: 'ana',
      actorId: 'beto',
      postId: 'p1',
      commentId: 'c1',
    });
  });

  it('respuesta (S4-14): reply al autor del comentario y comment al de la publicación', async () => {
    await listener.onComment({
      postId: 'p1',
      postAuthorId: 'ana',
      actorId: 'beto',
      commentId: 'c2',
      change: 'added',
      commentCount: 2,
      replyToAuthorId: 'carla',
    });
    expect(notifications.notify).toHaveBeenCalledTimes(2);
    expect(notifications.notify).toHaveBeenCalledWith({
      type: 'reply',
      recipientId: 'carla',
      actorId: 'beto',
      postId: 'p1',
      commentId: 'c2',
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'comment', recipientId: 'ana' }),
    );
  });

  it('respuesta al comentario del autor de la publicación: solo reply, sin duplicar', async () => {
    await listener.onComment({
      postId: 'p1',
      postAuthorId: 'ana',
      actorId: 'beto',
      commentId: 'c2',
      change: 'added',
      commentCount: 2,
      replyToAuthorId: 'ana',
    });
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'reply', recipientId: 'ana' }),
    );
  });

  it('comment.changed removed: nada', async () => {
    await listener.onComment({
      postId: 'p1',
      postAuthorId: 'ana',
      actorId: 'beto',
      commentId: 'c1',
      change: 'removed',
      commentCount: 0,
      replyToAuthorId: null,
    });
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('follow.created: follow para quien recibe el seguimiento', async () => {
    await listener.onFollow({ followerId: 'beto', followingId: 'ana' });
    expect(notifications.notify).toHaveBeenCalledWith({
      type: 'follow',
      recipientId: 'ana',
      actorId: 'beto',
    });
  });

  it('message.created y conversation.read ya no crean ni tocan notificaciones (S4-15)', () => {
    expect('onMessage' in listener).toBe(false);
    expect('onConversationRead' in listener).toBe(false);
  });
});
