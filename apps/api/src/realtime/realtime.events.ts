// Eventos de Socket.io de docs/05-api.md. Socket.io usa estas interfaces para revisar el nombre
// y los datos de cada emit: un evento que no está aquí no compila.
import type { UserSummaryData } from '../events/domain-events';
import type { ReactionType } from '../likes/reactions';

export interface PostWatchPayload {
  postIds: string[];
}

export interface PostLikesEvent {
  postId: string;
  likeCount: number;
  topReactions: ReactionType[];
}

export interface PostCommentsEvent {
  postId: string;
  commentCount: number;
}
export interface ConversationJoinPayload {
  conversationId: string;
}

export type ConversationJoinAck =
  { ok: true } | { ok: false; error: 'forbidden' };

export interface ConversationTypingEvent {
  conversationId: string;
  userId: string;
}

export interface ConversationReadSocketEvent {
  conversationId: string;
  userId: string;
  readAt: string;
}

export interface PresenceWatchPayload {
  userIds: string[];
}

export interface PresenceWatchAck {
  onlineUserIds: string[];
}

export interface UserPresenceEvent {
  userId: string;
  online: boolean;
}

export interface MessageNewEvent {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
}

export interface ConversationUpdatedEvent {
  id: string;
  otherUser: UserSummaryData;
  lastMessage: MessageNewEvent | null;
  unread: number;
}

export interface NotificationNewEvent {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'message';
  actor: UserSummaryData;
  postId: string | null;
  commentId: string | null;
  preview: string | null;
  reaction: ReactionType | null;
  read: boolean;
  createdAt: string;
}

export interface FeedNewEvent {
  postId: string;
  authorId: string;
}

// Cliente → servidor
export interface ClientToServerEvents {
  'post:watch': (data: PostWatchPayload) => void;
  'post:unwatch': (data: PostWatchPayload) => void;
  'conversation:join': (
    data: ConversationJoinPayload,
    ack?: (res: ConversationJoinAck) => void,
  ) => void;
  'conversation:typing': (data: ConversationJoinPayload) => void;
  'presence:watch': (
    data: PresenceWatchPayload,
    ack?: (res: PresenceWatchAck) => void,
  ) => void;
}

// Servidor → cliente
export interface ServerToClientEvents {
  'session:ready': (data: { userId: string }) => void;
  'post:likes': (data: PostLikesEvent) => void;
  'post:comments': (data: PostCommentsEvent) => void;
  'feed:new': (data: FeedNewEvent) => void;
  'message:new': (data: MessageNewEvent) => void;
  'conversation:updated': (data: ConversationUpdatedEvent) => void;
  'conversation:typing': (data: ConversationTypingEvent) => void;
  'conversation:read': (data: ConversationReadSocketEvent) => void;
  'user:presence': (data: UserPresenceEvent) => void;
  'notification:new': (data: NotificationNewEvent) => void;
}

// Lo que el middleware del handshake guarda en cada socket
export interface SocketData {
  userId: string;
  /** Vencimiento del JWT del handshake, en milisegundos. */
  expiresAt: number;
}

export const userRoom = (userId: string) => `user:${userId}`;
export const postRoom = (postId: string) => `post:${postId}`;
export const conversationRoom = (conversationId: string) =>
  `conv:${conversationId}`;
export const presenceRoom = (userId: string) => `presence:${userId}`;
