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
export type PostMediaInputDto = components["schemas"]["PostMediaInputDto"];
export type PostPageDto = components["schemas"]["PostPageDto"];
export type LikeStatusDto = components["schemas"]["LikeStatusDto"];
export type CommentDto = components["schemas"]["CommentDto"];
export type CommentPageDto = components["schemas"]["CommentPageDto"];
export type CreateCommentDto = components["schemas"]["CreateCommentDto"];
export type NotificationDto = components["schemas"]["NotificationDto"];
export type NotificationPageDto = components["schemas"]["NotificationPageDto"];
export type UnreadCountDto = components["schemas"]["UnreadCountDto"];
export type MarkReadDto = components["schemas"]["MarkReadDto"];

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
}

export interface ClientToServerEvents {
  "post:watch": (data: PostWatchPayload) => void;
  "post:unwatch": (data: PostWatchPayload) => void;
}

export interface ServerToClientEvents {
  "session:ready": (data: SessionReadyEvent) => void;
  "post:likes": (data: PostLikesEvent) => void;
}

