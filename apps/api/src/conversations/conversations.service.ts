import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
import {
  ConversationDto,
  MessageDto,
  MessagePageDto,
} from './dto/conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';

// La bandeja no se pagina: muestra las 50 conversaciones con el mensaje más reciente
export const INBOX_LIMIT = 50;

// Campos de Message (docs/05-api.md) para Prisma
const MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  senderId: true,
  content: true,
  createdAt: true,
} satisfies Prisma.MessageSelect;

// Una conversación guarda a sus dos participantes ordenados (CHECK user_a_id < user_b_id), así
// la pareja tiene una sola fila (RN09). Los UUID llegan en minúsculas y con el mismo formato,
// así que comparar el texto da el mismo orden que PostgreSQL al comparar uuid.
export function orderParticipants(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}

// Fila de la bandeja: la conversación, la otra persona, el último mensaje y los no leídos
interface ConversationRow {
  id: string;
  otherId: string;
  otherUsername: string;
  otherDisplayName: string | null;
  otherAvatarPublicId: string | null;
  messageId: string | null;
  senderId: string | null;
  content: string | null;
  messageCreatedAt: Date | null;
  unread: number;
}

// Fila del historial: created_at con microsegundos, para el cursor
interface MessageRow extends CursorKey {
  conversationId: string;
  senderId: string;
  content: string;
}

interface Participants {
  userAId: string;
  userBId: string;
}

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEvents,
  ) {}

  // Abre la conversación con username o devuelve la que ya existe. created indica si es
  // nueva (201) o ya existía (200).
  async open(
    userId: string,
    username: string,
  ): Promise<{ conversation: ConversationDto; created: boolean }> {
    // citext: la base compara sin distinguir mayúsculas
    const other = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (!other) throw new NotFoundException('Usuario no encontrado');
    if (other.id === userId) {
      throw new BadRequestException({
        message: 'username: no puedes abrir un chat contigo',
        details: [{ field: 'username', rule: 'notSelf' }],
      });
    }

    const [userAId, userBId] = orderParticipants(userId, other.id);
    // ON CONFLICT DO NOTHING: dos POST al mismo tiempo no duplican la pareja ni fallan
    const { count } = await this.prisma.conversation.createMany({
      data: [{ userAId, userBId }],
      skipDuplicates: true,
    });
    const { id } = await this.prisma.conversation.findUniqueOrThrow({
      where: { userAId_userBId: { userAId, userBId } },
      select: { id: true },
    });
    const [conversation] = await this.findForUser(
      userId,
      Prisma.sql`AND c.id = ${id}::uuid`,
      1,
    );
    return { conversation, created: count === 1 };
  }

  // La bandeja solo muestra conversaciones con al menos un mensaje (docs/05-api.md)
  inbox(userId: string): Promise<ConversationDto[]> {
    return this.findForUser(
      userId,
      Prisma.sql`AND c.last_message_at IS NOT NULL`,
      INBOX_LIMIT,
    );
  }

  // Del más reciente al más antiguo: la web carga el historial al subir y lo invierte
  async messages(
    conversationId: string,
    userId: string,
    rawCursor?: string,
  ): Promise<MessagePageDto> {
    const cursor = decodeCursor(rawCursor);
    await this.findParticipants(this.prisma, conversationId, userId);
    const before = cursor
      ? Prisma.sql`AND (m.created_at, m.id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<MessageRow[]>`
      SELECT m.id,
             m.conversation_id AS "conversationId",
             m.sender_id AS "senderId",
             m.content,
             to_char(m.created_at AT TIME ZONE 'UTC', ${CURSOR_AT_FORMAT}) AS "createdAt"
      FROM messages m
      WHERE m.conversation_id = ${conversationId}::uuid ${before}
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT ${PAGE_SIZE + 1}
    `;
    return toPage(rows, (row) => ({
      ...row,
      createdAt: new Date(row.createdAt),
    }));
  }

  // El remitente siempre es el usuario de la sesión. El mensaje, el orden de la bandeja y la
  // lectura del remitente cambian en la misma transacción.
  async send(
    conversationId: string,
    senderId: string,
    dto: SendMessageDto,
  ): Promise<MessageDto> {
    const { message, recipientId } = await this.prisma.$transaction(
      async (tx) => {
        const participants = await this.findParticipants(
          tx,
          conversationId,
          senderId,
        );
        const message = await tx.message.create({
          data: { conversationId, senderId, content: dto.content },
          select: MESSAGE_SELECT,
        });
        // Con la fecha de la base (microsegundos), no la del Date de JS (milisegundos): si no,
        // el "leído hasta" quedaría antes del propio mensaje. GREATEST: nunca retrocede si dos
        // mensajes se confirman en otro orden. Quien escribe ya leyó todo lo anterior.
        await tx.$executeRaw`
          UPDATE conversations c
          SET last_message_at = GREATEST(m.created_at, COALESCE(c.last_message_at, m.created_at)),
              user_a_last_read_at = CASE WHEN c.user_a_id = ${senderId}::uuid
                THEN GREATEST(m.created_at, COALESCE(c.user_a_last_read_at, m.created_at))
                ELSE c.user_a_last_read_at END,
              user_b_last_read_at = CASE WHEN c.user_b_id = ${senderId}::uuid
                THEN GREATEST(m.created_at, COALESCE(c.user_b_last_read_at, m.created_at))
                ELSE c.user_b_last_read_at END
          FROM (SELECT created_at FROM messages WHERE id = ${message.id}::uuid) m
          WHERE c.id = ${conversationId}::uuid
        `;
        const recipientId =
          participants.userAId === senderId
            ? participants.userBId
            : participants.userAId;
        return { message, recipientId };
      },
    );

    this.events.emit('message.created', { message, recipientId });
    return message;
  }

  // Marca como leído hasta el último mensaje que existe ahora. Uno que llegue después
  // sigue contando como no leído.
  async markRead(conversationId: string, userId: string): Promise<void> {
    await this.findParticipants(this.prisma, conversationId, userId);
    await this.prisma.$executeRaw`
      UPDATE conversations c
      SET user_a_last_read_at = CASE WHEN c.user_a_id = ${userId}::uuid
            THEN GREATEST(m.latest, COALESCE(c.user_a_last_read_at, m.latest))
            ELSE c.user_a_last_read_at END,
          user_b_last_read_at = CASE WHEN c.user_b_id = ${userId}::uuid
            THEN GREATEST(m.latest, COALESCE(c.user_b_last_read_at, m.latest))
            ELSE c.user_b_last_read_at END
      FROM (SELECT max(created_at) AS latest FROM messages
            WHERE conversation_id = ${conversationId}::uuid) m
      WHERE c.id = ${conversationId}::uuid AND m.latest IS NOT NULL
    `;
  }

  // RN09: 404 si la conversación no existe y 403 si existe pero no participo
  private async findParticipants(
    client: Prisma.TransactionClient,
    conversationId: string,
    userId: string,
  ): Promise<Participants> {
    const conversation = await client.conversation.findUnique({
      where: { id: conversationId },
      select: { userAId: true, userBId: true },
    });
    if (!conversation) {
      throw new NotFoundException('Conversación no encontrada');
    }
    if (conversation.userAId !== userId && conversation.userBId !== userId) {
      throw new ForbiddenException('No participas en esta conversación');
    }
    return conversation;
  }

  // Una consulta para la bandeja y para una sola conversación: la otra persona, el último
  // mensaje y los mensajes del otro posteriores a mi "leído hasta" (sin lectura, todos).
  private async findForUser(
    userId: string,
    where: Prisma.Sql,
    limit: number,
  ): Promise<ConversationDto[]> {
    const rows = await this.prisma.$queryRaw<ConversationRow[]>`
      SELECT c.id,
             u.id AS "otherId",
             u.username::text AS "otherUsername",
             u.display_name AS "otherDisplayName",
             u.avatar_public_id AS "otherAvatarPublicId",
             m.id AS "messageId",
             m.sender_id AS "senderId",
             m.content,
             m.created_at AS "messageCreatedAt",
             (SELECT count(*)::int FROM messages x
              WHERE x.conversation_id = c.id
                AND x.sender_id <> ${userId}::uuid
                AND x.created_at > COALESCE(
                  CASE WHEN c.user_a_id = ${userId}::uuid
                    THEN c.user_a_last_read_at ELSE c.user_b_last_read_at END,
                  '-infinity'::timestamptz)) AS unread
      FROM conversations c
      JOIN users u ON u.id = CASE WHEN c.user_a_id = ${userId}::uuid
                                  THEN c.user_b_id ELSE c.user_a_id END
      LEFT JOIN LATERAL (
        SELECT id, sender_id, content, created_at FROM messages
        WHERE conversation_id = c.id
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      ) m ON true
      WHERE (c.user_a_id = ${userId}::uuid OR c.user_b_id = ${userId}::uuid) ${where}
      ORDER BY c.last_message_at DESC NULLS LAST, c.id DESC
      LIMIT ${limit}
    `;
    return rows.map(toConversationDto);
  }
}

function toConversationDto(row: ConversationRow): ConversationDto {
  return {
    id: row.id,
    otherUser: {
      id: row.otherId,
      username: row.otherUsername,
      displayName: row.otherDisplayName,
      avatarPublicId: row.otherAvatarPublicId,
    },
    lastMessage:
      row.messageId && row.senderId && row.content && row.messageCreatedAt
        ? {
            id: row.messageId,
            conversationId: row.id,
            senderId: row.senderId,
            content: row.content,
            createdAt: row.messageCreatedAt,
          }
        : null,
    unread: row.unread,
  };
}
