import { NotificationsListener } from './notifications.listener';
import { NotificationsService } from './notifications.service';

// Qué notificación pide cada evento de dominio. Que se registren con @OnDomainEvent lo prueba
// test/notifications.e2e-spec.ts con la app completa.
describe('NotificationsListener', () => {
  const notifications = { notify: jest.fn() };
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
      topReactions: ['like'],
    });
    expect(notifications.notify).toHaveBeenCalledWith({
      type: 'like',
      recipientId: 'ana',
      actorId: 'beto',
      postId: 'p1',
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
    });
    expect(notifications.notify).toHaveBeenCalledWith({
      type: 'comment',
      recipientId: 'ana',
      actorId: 'beto',
      postId: 'p1',
      commentId: 'c1',
    });
  });

  it('comment.changed removed: nada', async () => {
    await listener.onComment({
      postId: 'p1',
      postAuthorId: 'ana',
      actorId: 'beto',
      commentId: 'c1',
      change: 'removed',
      commentCount: 0,
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

  it('message.created: message del remitente al receptor', async () => {
    await listener.onMessage({
      recipientId: 'ana',
      message: {
        id: 'm1',
        conversationId: 'conv1',
        senderId: 'beto',
        content: 'Hola',
        createdAt: new Date(),
      },
    });
    expect(notifications.notify).toHaveBeenCalledWith({
      type: 'message',
      recipientId: 'ana',
      actorId: 'beto',
    });
  });
});
