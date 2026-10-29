import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CURSOR_AT_FORMAT,
  decodeCursor,
  PAGE_SIZE,
  toPage,
  type CursorKey,
} from '../common/pagination';
import { DomainEvents } from '../events/domain-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { MarkReadDto } from './dto/mark-read.dto';
import {
  NotificationDto,
  NotificationPageDto,
  NotificationType,
  UnreadCountDto,
} from './dto/notification.dto';

// Lo que crea una notificación; recipientId y actorId siempre vienen de un evento de dominio
export interface NewNotification {
  type: NotificationType;
  recipientId: string;
  actorId: string;
  postId?: string;
  commentId?: string;
}

// Campos de Notification (docs/05-api.md) para Prisma
const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  postId: true,
  commentId: true,
  readAt: true,
  createdAt: true,
  actor: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarPublicId: true,
    },
  },
} satisfies Prisma.NotificationSelect;

type NotificationRow = Prisma.NotificationGetPayload<{
  select: typeof NOTIFICATION_SELECT;
}>;

// Fila de la lista: la notificación (id y created_at con microsegundos, para el cursor) y su actor
interface ListRow extends CursorKey {
  type: NotificationType;
  postId: string | null;
  commentId: string | null;
  read: boolean;
  actorId: string;
  username: string;
  displayName: string | null;
  avatarPublicId: string | null;
}

// Una notificación de una publicación o un comentario que se borró ya no se muestra ni se
// cuenta: su enlace llevaría a un 404. Las de follow y message no tienen post ni comentario.
const VISIBLE_FROM = Prisma.sql`
  FROM notifications n
  LEFT JOIN posts p ON p.id = n.post_id
  LEFT JOIN comments c ON c.id = n.comment_id
`;
const VISIBLE = Prisma.sql`p.deleted_at IS NULL AND c.deleted_at IS NULL`;

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEvents,
  ) {}

  // La llaman los listeners. Nunca para uno mismo (RN08; la base también lo impide con un
  // CHECK). De message solo una sin leer por remitente (docs/05-api.md): mientras la campana
  // ya avisa de ese chat, los mensajes siguientes no agregan otra. Emite notification.created
  // para que el Gateway la mande a user:{recipientId}.
  async notify(input: NewNotification): Promise<NotificationDto | null> {
    if (input.recipientId === input.actorId) return null;
    if (input.type === 'message') {
      const pending = await this.prisma.notification.findFirst({
        where: {
          type: 'message',
          recipientId: input.recipientId,
          actorId: input.actorId,
          readAt: null,
        },
        select: { id: true },
      });
      if (pending) return null;
    }

    const row = await this.prisma.notification.create({
      data: {
        type: input.type,
        recipientId: input.recipientId,
        actorId: input.actorId,
        postId: input.postId ?? null,
        commentId: input.commentId ?? null,
      },
      select: NOTIFICATION_SELECT,
    });
    const notification = toNotificationDto(row);
    this.events.emit('notification.created', {
      recipientId: input.recipientId,
      notification,
    });
    return notification;
  }

  // De la más reciente a la más antigua (docs/05-api.md)
  async list(
    recipientId: string,
    rawCursor?: string,
  ): Promise<NotificationPageDto> {
    const cursor = decodeCursor(rawCursor);
    const before = cursor
      ? Prisma.sql`AND (n.created_at, n.id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<ListRow[]>`
      SELECT n.id,
             n.type,
             n.post_id AS "postId",
             n.comment_id AS "commentId",
             n.read_at IS NOT NULL AS read,
             to_char(n.created_at AT TIME ZONE 'UTC', ${CURSOR_AT_FORMAT}) AS "createdAt",
             u.id AS "actorId",
             u.username::text AS username,
             u.display_name AS "displayName",
             u.avatar_public_id AS "avatarPublicId"
      ${VISIBLE_FROM}
      JOIN users u ON u.id = n.actor_id
      WHERE n.recipient_id = ${recipientId}::uuid AND ${VISIBLE} ${before}
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT ${PAGE_SIZE + 1}
    `;
    return toPage(rows, toListItem);
  }

  // Las mismas que muestra la lista, sin leer (usa el índice parcial notifications_unread_idx)
  async unreadCount(recipientId: string): Promise<UnreadCountDto> {
    const [{ count }] = await this.prisma.$queryRaw<[{ count: number }]>`
      SELECT count(*)::int AS count
      ${VISIBLE_FROM}
      WHERE n.recipient_id = ${recipientId}::uuid AND n.read_at IS NULL AND ${VISIBLE}
    `;
    return { count };
  }

  // Solo las del usuario de la sesión: una id ajena o inexistente no cambia nada y no da
  // error, igual que una ya leída (conserva su primera fecha de lectura).
  async markRead(recipientId: string, dto: MarkReadDto): Promise<void> {
    await this.prisma.notification.updateMany({
      where: {
        recipientId,
        readAt: null,
        ...(dto.all ? {} : { id: { in: dto.ids ?? [] } }),
      },
      data: { readAt: new Date() },
    });
  }
}

function toNotificationDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    type: row.type as NotificationType,
    actor: row.actor,
    postId: row.postId,
    commentId: row.commentId,
    read: row.readAt !== null,
    createdAt: row.createdAt,
  };
}

function toListItem(row: ListRow): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    postId: row.postId,
    commentId: row.commentId,
    read: row.read,
    createdAt: new Date(row.createdAt),
    actor: {
      id: row.actorId,
      username: row.username,
      displayName: row.displayName,
      avatarPublicId: row.avatarPublicId,
    },
  };
}
