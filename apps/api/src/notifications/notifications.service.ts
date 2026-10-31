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
import { isReaction, type ReactionType } from '../likes/reactions';
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
  preview?: string | null;
  reaction?: ReactionType | null;
}

export const PREVIEW_MAX_LENGTH = 80;
export const MAX_COMMENT_NOTIFICATIONS_PER_POST = 10;

export function toPreview(content: string | null | undefined): string | null {
  if (!content) return null;
  const singleLine = content.replace(/\s+/g, ' ').trim();
  if (!singleLine) return null;
  // Por puntos de código, no por unidades UTF-16: así un emoji nunca queda partido a la mitad
  const chars = Array.from(singleLine);
  return chars.length > PREVIEW_MAX_LENGTH
    ? `${chars.slice(0, PREVIEW_MAX_LENGTH).join('')}…`
    : singleLine;
}

// Campos de Notification (docs/05-api.md) para Prisma
const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  postId: true,
  commentId: true,
  readAt: true,
  createdAt: true,
  comment: {
    select: {
      content: true,
    },
  },
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
  rawPreview: string | null;
  rawReaction: string | null;
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
  // CHECK). De like solo una por persona y publicación; de comment hasta 10 por persona y
  // publicación (S4-11), y otras 10 de reply (S4-14); de message solo una sin leer por remitente (docs/05-api.md). Emite
  // notification.created para que el Gateway la mande a user:{recipientId}.
  async notify(input: NewNotification): Promise<NotificationDto | null> {
    if (input.recipientId === input.actorId) return null;
    if (input.type === 'like') {
      const existing = await this.prisma.notification.findFirst({
        where: {
          type: 'like',
          recipientId: input.recipientId,
          actorId: input.actorId,
          postId: input.postId ?? null,
        },
        select: { id: true },
      });
      if (existing) return null;
    }
    // S4-14: el mismo tope para las respuestas, contadas aparte de los comentarios
    if (input.type === 'comment' || input.type === 'reply') {
      const count = await this.prisma.notification.count({
        where: {
          type: input.type,
          recipientId: input.recipientId,
          actorId: input.actorId,
          postId: input.postId ?? null,
        },
      });
      if (count >= MAX_COMMENT_NOTIFICATIONS_PER_POST) return null;
    }
    if (input.type === 'message') {
      // Si el destinatario ya leyó la conversación en /chat (o respondió) después de la
      // notificación anterior, esa notificación ya quedó atendida y el nuevo mensaje sí debe
      // disparar una ventana emergente nueva. Si sigue sin leer los mensajes, se limita a una.
      await this.prisma.$executeRaw`
        UPDATE notifications n
        SET read_at = CASE
          WHEN c.user_a_id = ${input.recipientId}::uuid THEN c.user_a_last_read_at
          ELSE c.user_b_last_read_at
        END
        FROM conversations c
        WHERE c.user_a_id = LEAST(${input.recipientId}::uuid, ${input.actorId}::uuid)
          AND c.user_b_id = GREATEST(${input.recipientId}::uuid, ${input.actorId}::uuid)
          AND n.type = 'message'
          AND n.recipient_id = ${input.recipientId}::uuid
          AND n.actor_id = ${input.actorId}::uuid
          AND n.read_at IS NULL
          AND (
            CASE
              WHEN c.user_a_id = ${input.recipientId}::uuid THEN c.user_a_last_read_at
              ELSE c.user_b_last_read_at
            END
          ) >= n.created_at
      `;
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
    const notification = toNotificationDto(row, input.preview, input.reaction);
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
             CASE
               WHEN n.type IN ('comment', 'reply') THEN c.content
               WHEN n.type = 'message' THEN (
                 SELECT m.content
                 FROM conversations cv
                 JOIN messages m ON m.conversation_id = cv.id
                 WHERE cv.user_a_id = LEAST(n.recipient_id, n.actor_id)
                   AND cv.user_b_id = GREATEST(n.recipient_id, n.actor_id)
                   AND m.sender_id = n.actor_id
                 ORDER BY m.created_at DESC, m.id DESC
                 LIMIT 1
               )
               ELSE NULL
             END AS "rawPreview",
             CASE
               WHEN n.type = 'like' THEN (
                 SELECT pl.reaction
                 FROM post_likes pl
                 WHERE pl.post_id = n.post_id AND pl.user_id = n.actor_id
               )
             END AS "rawReaction",
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

  // Al leer una conversación en /chat, marca también como leídas las notificaciones de
  // mensaje pendientes de ese remitente para que futuros mensajes vuelvan a notificar.
  async markConversationMessagesRead(
    conversationId: string,
    userId: string,
    readAt: Date,
  ): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE notifications n
      SET read_at = ${readAt}::timestamptz
      FROM conversations c
      WHERE c.id = ${conversationId}::uuid
        AND n.type = 'message'
        AND n.recipient_id = ${userId}::uuid
        AND n.actor_id = CASE
          WHEN c.user_a_id = ${userId}::uuid THEN c.user_b_id
          ELSE c.user_a_id
        END
        AND n.read_at IS NULL
    `;
  }
}

function toNotificationDto(
  row: NotificationRow,
  rawPreview?: string | null,
  reaction?: ReactionType | null,
): NotificationDto {
  return {
    id: row.id,
    type: row.type as NotificationType,
    actor: row.actor,
    postId: row.postId,
    commentId: row.commentId,
    preview: toPreview(rawPreview ?? row.comment?.content ?? null),
    reaction: reaction ?? null,
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
    preview: toPreview(row.rawPreview),
    // Se lee al listar: muestra la reacción actual aunque haya cambiado después de crearse
    reaction:
      row.rawReaction !== null && isReaction(row.rawReaction)
        ? row.rawReaction
        : null,
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
