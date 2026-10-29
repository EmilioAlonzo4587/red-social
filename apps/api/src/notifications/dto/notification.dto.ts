import { ApiProperty } from '@nestjs/swagger';
import { UserSummaryDto } from '../../users/dto/user-summary.dto';

export const NOTIFICATION_TYPES = [
  'like',
  'comment',
  'follow',
  'message',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// Objeto Notification de docs/05-api.md. La web arma el enlace con type: like y comment van a
// /p/{postId}, follow a /u/{actor.username} y message abre el chat con actor.username.
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
