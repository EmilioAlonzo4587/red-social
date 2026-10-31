export type { paths, components, operations } from "./openapi";

import type { components } from "./openapi";

export type RegisterDto = components["schemas"]["RegisterDto"];
export type LoginDto = components["schemas"]["LoginDto"];
export type MeDto = components["schemas"]["MeDto"];
export type ErrorResponseDto = components["schemas"]["ErrorResponseDto"];
export type ErrorDetailDto = components["schemas"]["ErrorDetailDto"];
export type HealthResponseDto = components["schemas"]["HealthResponseDto"];
export type ProfileDto = components["schemas"]["ProfileDto"];
export type UpdateMeDto = components["schemas"]["UpdateMeDto"];
export type UserSummaryDto = components["schemas"]["UserSummaryDto"];
export type UserSummaryPageDto = components["schemas"]["UserSummaryPageDto"];
export type FollowStatusDto = components["schemas"]["FollowStatusDto"];
export type MediaDto = components["schemas"]["MediaDto"];
export type PostDto = components["schemas"]["PostDto"];
export type CreatePostDto = components["schemas"]["CreatePostDto"];
export type UpdatePostDto = components["schemas"]["UpdatePostDto"];
export type PostMediaInputDto = components["schemas"]["PostMediaInputDto"];
export type PostPageDto = components["schemas"]["PostPageDto"];
export type LikeStatusDto = components["schemas"]["LikeStatusDto"];
export type ReactToPostDto = components["schemas"]["ReactToPostDto"];
export type ReactionType = NonNullable<PostDto["myReaction"]>;
export type CommentDto = components["schemas"]["CommentDto"];
export type CommentPageDto = components["schemas"]["CommentPageDto"];
export type CreateCommentDto = components["schemas"]["CreateCommentDto"];
export type NotificationDto = components["schemas"]["NotificationDto"];
export type NotificationPageDto = components["schemas"]["NotificationPageDto"];
export type UnreadCountDto = components["schemas"]["UnreadCountDto"];
export type MarkReadDto = components["schemas"]["MarkReadDto"];
export type ConversationDto = components["schemas"]["ConversationDto"];
export type MessageDto = components["schemas"]["MessageDto"];
export type MessagePageDto = components["schemas"]["MessagePageDto"];
export type OpenConversationDto = components["schemas"]["OpenConversationDto"];
export type SendMessageDto = components["schemas"]["SendMessageDto"];

// Eventos de Socket.io (docs/05-api.md)
export interface SessionReadyEvent {
  userId: string;
}

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
  | { ok: true }
  | { ok: false; error: "forbidden" };

export type MessageNewEvent = MessageDto;
export type ConversationUpdatedEvent = ConversationDto;
export type NotificationNewEvent = NotificationDto;

export interface ConversationTypingEvent {
  conversationId: string;
  userId: string;
}

export interface ConversationReadEvent {
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

export interface ClientToServerEvents {
  "post:watch": (data: PostWatchPayload) => void;
  "post:unwatch": (data: PostWatchPayload) => void;
  "conversation:join": (
    data: ConversationJoinPayload,
    ack?: (res: ConversationJoinAck) => void,
  ) => void;
  "conversation:typing": (data: ConversationJoinPayload) => void;
  "presence:watch": (
    data: PresenceWatchPayload,
    ack?: (res: PresenceWatchAck) => void,
  ) => void;
}

export interface ServerToClientEvents {
  "session:ready": (data: SessionReadyEvent) => void;
  "post:likes": (data: PostLikesEvent) => void;
  "post:comments": (data: PostCommentsEvent) => void;
  "message:new": (data: MessageNewEvent) => void;
  "conversation:updated": (data: ConversationUpdatedEvent) => void;
  "conversation:typing": (data: ConversationTypingEvent) => void;
  "conversation:read": (data: ConversationReadEvent) => void;
  "user:presence": (data: UserPresenceEvent) => void;
  "notification:new": (data: NotificationNewEvent) => void;
}

