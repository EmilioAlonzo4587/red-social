import { Injectable } from '@nestjs/common';
import type {
  CommentChangedEvent,
  ConversationReadEvent,
  FollowCreatedEvent,
  LikeChangedEvent,
  MessageCreatedEvent,
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

  // Lo emitirá el chat (S3-04)
  @OnDomainEvent('message.created')
  async onMessage(event: MessageCreatedEvent): Promise<void> {
    await this.notifications.notify({
      type: 'message',
      recipientId: event.recipientId,
      actorId: event.message.senderId,
      preview: event.message.content,
    });
  }

  @OnDomainEvent('conversation.read')
  async onConversationRead(event: ConversationReadEvent): Promise<void> {
    await this.notifications.markConversationMessagesRead(
      event.conversationId,
      event.userId,
      event.readAt,
    );
  }
}
