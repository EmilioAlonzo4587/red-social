// Contrato de eventos de dominio (D08, docs/03-arquitectura.md). Los módulos de contenido los
// emiten con DomainEvents y el Gateway (Dev 3) y las notificaciones los escuchan con
// @OnDomainEvent. Ningún servicio llama al Gateway directamente.
// Se emiten después de que la transacción se confirmó, nunca dentro de ella.

import type { ReactionType } from '../likes/reactions';

// Vista mínima de un usuario, igual que UserSummary de docs/05-api.md
export interface UserSummaryData {
  id: string;
  username: string;
  displayName: string | null;
  avatarPublicId: string | null;
}

// Se agregó o se quitó una fila (un like o un comentario)
export type CountChange = 'added' | 'removed';

// Una reacción que se agregó o se quitó, o que se cambió por otra sin mover el total
export type LikeChange = CountChange | 'changed';

// Reacción que sí cambió algo; repetir un PUT idempotente no emite nada (RN05). El Gateway
// envía post:likes { postId, likeCount, topReactions } a la sala post:{postId}.
export interface LikeChangedEvent {
  postId: string;
  postAuthorId: string;
  actorId: string;
  change: LikeChange;
  likeCount: number;
  topReactions: ReactionType[];
  // La reacción de actorId después del cambio; null si la quitó
  reaction: ReactionType | null;
}

// Comentario creado o borrado. El Gateway envía post:comments { postId, commentCount }.
export interface CommentChangedEvent {
  postId: string;
  postAuthorId: string;
  actorId: string;
  commentId: string;
  change: CountChange;
  commentCount: number;
  // Respuesta (S4-14): autor del comentario al que se respondió; null en un comentario
  // de primer nivel. Es a quien se le notifica "respondió a tu comentario".
  replyToAuthorId: string | null;
}

// Solo cuando se crea la fila; seguir a quien ya sigo no emite nada (RN06)
export interface FollowCreatedEvent {
  followerId: string;
  followingId: string;
}

// Igual que Message de docs/05-api.md
export interface MessageData {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: Date;
}

// El Gateway envía message:new a conv:{conversationId} y conversation:updated a las salas
// user:{id} de los dos participantes
export interface MessageCreatedEvent {
  message: MessageData;
  recipientId: string;
}

// El Gateway envía conversation:read a conv:{conversationId} cuando un participante lee el chat
export interface ConversationReadEvent {
  conversationId: string;
  userId: string;
  readAt: Date;
}

// Igual que Notification de docs/05-api.md
export interface NotificationData {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'reply';
  actor: UserSummaryData;
  postId: string | null;
  commentId: string | null;
  preview: string | null;
  reaction: ReactionType | null;
  read: boolean;
  createdAt: Date;
}

// El Gateway envía notification:new a la sala user:{recipientId}
export interface NotificationCreatedEvent {
  recipientId: string;
  notification: NotificationData;
}

// Publicación creada (S4-11). El Gateway envía feed:new { postId, authorId } a la sala
// user:{id} de cada seguidor del autor (D11), sin crear filas en notifications.
export interface PostCreatedEvent {
  postId: string;
  authorId: string;
}

// Nombre de cada evento y sus datos. Un evento nuevo se agrega aquí y en docs/03-arquitectura.md.
export interface DomainEventMap {
  'post.created': PostCreatedEvent;
  'like.changed': LikeChangedEvent;
  'comment.changed': CommentChangedEvent;
  'follow.created': FollowCreatedEvent;
  'message.created': MessageCreatedEvent;
  'conversation.read': ConversationReadEvent;
  'notification.created': NotificationCreatedEvent;
}

export type DomainEventName = keyof DomainEventMap;
