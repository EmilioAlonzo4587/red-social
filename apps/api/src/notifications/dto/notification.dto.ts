import { ApiProperty } from '@nestjs/swagger';
import { REACTIONS, type ReactionType } from '../../likes/reactions';
import { UserSummaryDto } from '../../users/dto/user-summary.dto';

export const NOTIFICATION_TYPES = [
  'like',
  'comment',
  'follow',
  'reply',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// Objeto Notification de docs/05-api.md. La web arma el enlace con type: like, comment y reply van a
// /p/{postId} y follow a /u/{actor.username}. Los mensajes no se guardan como notificación (S4-15).
export class NotificationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: NOTIFICATION_TYPES, example: 'like' })
  type!: NotificationType;

  @ApiProperty({ type: UserSummaryDto, description: 'Quién la provocó' })
  actor!: UserSummaryDto;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'En like y comment',
  })
  postId!: string | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'En comment',
  })
  commentId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Primeros ~80 caracteres del comentario o la respuesta; null en like y follow',
  })
  preview!: string | null;

  @ApiProperty({
    enum: REACTIONS,
    nullable: true,
    example: 'love',
    description:
      'En like: la reacción actual de actor; null si ya la quitó o si es de otro tipo',
  })
  reaction!: ReactionType | null;

  @ApiProperty({ example: false })
  read!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

// Page<Notification> de docs/05-api.md
export class NotificationPageDto {
  @ApiProperty({ type: [NotificationDto] })
  items!: NotificationDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Se manda como ?cursor= para la siguiente página; null en la última',
  })
  nextCursor!: string | null;
}

// GET /notifications/unread-count
export class UnreadCountDto {
  @ApiProperty({ example: 3 })
  count!: number;
}
