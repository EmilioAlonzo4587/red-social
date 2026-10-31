import { Injectable } from '@nestjs/common';
import type {
  CommentChangedEvent,
  FollowCreatedEvent,
  LikeChangedEvent,
} from '../events/domain-events';
import { OnDomainEvent } from '../events/on-domain-event.decorator';
import { NotificationsService } from './notifications.service';

// Traduce los eventos de dominio en notificaciones (D08, docs/03-arquitectura.md). Corre después
// de que la petición confirmó su transacción; si falla, @nestjs/event-emitter lo registra en el
// log y la petición del usuario no se entera. NotificationsService descarta las de uno mismo.
@Injectable()
export class NotificationsListener {
  constructor(private readonly notifications: NotificationsService) {}

  // Quitar el like o borrar el comentario no borra la notificación ya creada
  @OnDomainEvent('like.changed')
  async onLike(event: LikeChangedEvent): Promise<void> {
    if (event.change !== 'added') return;
    await this.notifications.notify({
      type: 'like',
      recipientId: event.postAuthorId,
      actorId: event.actorId,
      postId: event.postId,
      reaction: event.reaction,
    });
  }

  @OnDomainEvent('comment.changed')
  async onComment(event: CommentChangedEvent): Promise<void> {
    if (event.change !== 'added') return;
    // S4-14: una respuesta avisa a quien escribió el comentario respondido. Si esa persona
    // es también la autora de la publicación, le basta con esa: no se duplica con la de
    // comentario. notify descarta las de uno mismo (RN08).
    if (event.replyToAuthorId) {
      await this.notifications.notify({
        type: 'reply',
        recipientId: event.replyToAuthorId,
        actorId: event.actorId,
        postId: event.postId,
        commentId: event.commentId,
      });
      if (event.replyToAuthorId === event.postAuthorId) return;
    }
    await this.notifications.notify({
      type: 'comment',
      recipientId: event.postAuthorId,
      actorId: event.actorId,
      postId: event.postId,
      commentId: event.commentId,
    });
  }

  @OnDomainEvent('follow.created')
  async onFollow(event: FollowCreatedEvent): Promise<void> {
    await this.notifications.notify({
      type: 'follow',
      recipientId: event.followingId,
      actorId: event.followerId,
    });
  }

  // Los mensajes no se guardan como notificación (S4-15): el aviso emergente sale de
  // conversation:updated y el contador de no leídos vive en la bandeja del chat.
}
