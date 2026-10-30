import { Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { DefaultEventsMap, Server, Socket } from 'socket.io';
import { ACCESS_COOKIE } from '../auth/cookies';
import { SessionTokenService } from '../auth/session-token.service';
import { ENV, type Env } from '../config/env';
import { ConversationsService } from '../conversations/conversations.service';
import type { ConversationDto } from '../conversations/dto/conversation.dto';
import type {
  CommentChangedEvent,
  LikeChangedEvent,
  MessageCreatedEvent,
  MessageData,
  NotificationCreatedEvent,
  NotificationData,
} from '../events/domain-events';
import { OnDomainEvent } from '../events/on-domain-event.decorator';
import { ConversationJoinDto } from './dto/conversation-join.dto';
import { PostWatchDto, parseWsDto } from './dto/post-watch.dto';
import {
  type ClientToServerEvents,
  type ConversationUpdatedEvent,
  type ConversationJoinAck,
  type MessageNewEvent,
  type NotificationNewEvent,
  type ServerToClientEvents,
  type SocketData,
  conversationRoom,
  postRoom,
  userRoom,
} from './realtime.events';

type AppServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>;
type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>;

// setTimeout acepta como máximo 2^31 - 1 ms (unos 24 días); con más, se dispara enseguida
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

// Tope de salas post:{id} por socket. Cada post:watch trae hasta 100 ids, pero sin este tope
// un cliente podría unirse a salas sin límite mandando muchos eventos. 500 alcanza para
// 25 páginas de feed cargadas a la vez.
export const MAX_WATCHED_POSTS_PER_SOCKET = 500;

// Tope de salas conv:{id} por socket. Cada conversation:join consulta la base; al pasar el tope
// sale de la más antigua, así el ack sigue siendo { ok: true } y la web, que abre una
// conversación a la vez, no lo nota. 50, igual que la bandeja (INBOX_LIMIT).
export const MAX_JOINED_CONVERSATIONS_PER_SOCKET = 50;

// Cuánto falta para que venza el JWT, en milisegundos, dentro del rango que acepta setTimeout
export function msUntilExpiry(expiresAt: number, now = Date.now()): number {
  return Math.min(Math.max(expiresAt - now, 0), MAX_TIMEOUT_MS);
}

// Sin puerto: Socket.io comparte el servidor HTTP de la api (el adaptador lo configura)
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: AppServer;

  constructor(
    private readonly tokens: SessionTokenService,
    @Inject(ENV) private readonly env: Env,
    private readonly conversations: ConversationsService,
  ) {}

  // Corre una vez, cuando el servidor de Socket.io ya existe. El middleware se ejecuta en cada
  // handshake, antes de aceptar la conexión: si llama a next(error), el cliente recibe
  // connect_error con error.message y handleConnection nunca corre.
  afterInit(server: AppServer): void {
    server.use((socket, next) => {
      this.authenticate(socket).then(next, next);
    });
  }

  // Ya autenticado: entra a su sala y queda programada la desconexión al vencer el JWT
  async handleConnection(socket: AppSocket): Promise<void> {
    const { userId, expiresAt } = socket.data;
    await socket.join(userRoom(userId));

    // El socket no vuelve a mirar la cookie: sin este temporizador seguiría abierto aunque el
    // JWT venza, haya logout o RN12 cierre las sesiones. El cliente renueva con
    // POST /api/auth/refresh y vuelve a conectar.
    const timer = setTimeout(
      () => socket.disconnect(true),
      msUntilExpiry(expiresAt),
    );
    socket.once('disconnect', () => clearTimeout(timer));

    // Evento de prueba (docs/05-api.md): confirma al cliente que la sesión funcionó
    socket.emit('session:ready', { userId });
  }

  // S2-03: el cliente se suscribe a las publicaciones que tiene en pantalla
  @SubscribeMessage('post:watch')
  async handlePostWatch(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    const dto = parseWsDto(PostWatchDto, payload);
    if (!dto) return;

    // Solo las salas nuevas cuentan para el tope; repetir un id no ocupa otro lugar
    const rooms = [...new Set(dto.postIds.map(postRoom))].filter(
      (room) => !socket.rooms.has(room),
    );
    const watching = [...socket.rooms].filter((room) =>
      room.startsWith('post:'),
    ).length;
    const free = MAX_WATCHED_POSTS_PER_SOCKET - watching;
    if (rooms.length > free) {
      this.logger.warn(
        `Socket ${socket.id} llegó al tope de ${MAX_WATCHED_POSTS_PER_SOCKET} publicaciones en vivo`,
      );
    }
    if (free <= 0) return;
    await socket.join(rooms.slice(0, free));
  }

  // S2-03: el cliente sale de las salas de publicaciones que ya no están en pantalla
  @SubscribeMessage('post:unwatch')
  async handlePostUnwatch(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    const dto = parseWsDto(PostWatchDto, payload);
    if (!dto) return;
    for (const postId of dto.postIds) {
      await socket.leave(postRoom(postId));
    }
  }

  // S2-03: cuando cambia el contador de likes (S2-07), avisa a quienes miran esa publicación
  @OnDomainEvent('like.changed')
  handleLikeChanged(event: LikeChangedEvent): void {
    this.server.to(postRoom(event.postId)).emit('post:likes', {
      postId: event.postId,
      likeCount: event.likeCount,
    });
  }

  // S3-18: igual que handleLikeChanged, pero para el contador de comentarios (S3-01)
  @OnDomainEvent('comment.changed')
  handleCommentChanged(event: CommentChangedEvent): void {
    this.server.to(postRoom(event.postId)).emit('post:comments', {
      postId: event.postId,
      commentCount: event.commentCount,
    });
  }
  // S3-05: entra a la sala de la conversación solo si participa; responde por acknowledgement (RN09)
  @SubscribeMessage('conversation:join')
  async handleConversationJoin(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() payload: unknown,
  ): Promise<ConversationJoinAck> {
    const dto = parseWsDto(ConversationJoinDto, payload);
    if (!dto) return { ok: false, error: 'forbidden' };

    // Ya está en la sala: la participación se verificó al entrar y no cambia
    const room = conversationRoom(dto.conversationId);
    if (socket.rooms.has(room)) return { ok: true };

    const allowed = await this.conversations.isParticipant(
      dto.conversationId,
      socket.data.userId,
    );
    if (!allowed) return { ok: false, error: 'forbidden' };

    // socket.rooms conserva el orden de entrada: la primera conv: es la más antigua
    const joined = [...socket.rooms].filter((r) => r.startsWith('conv:'));
    if (joined.length >= MAX_JOINED_CONVERSATIONS_PER_SOCKET) {
      await socket.leave(joined[0]);
    }
    await socket.join(room);
    return { ok: true };
  }

  // S3-05: envía el mensaje nuevo a la conversación abierta y actualiza la bandeja de ambos
  @OnDomainEvent('message.created')
  async handleMessageCreated({
    message,
    recipientId,
  }: MessageCreatedEvent): Promise<void> {
    this.server
      .to(conversationRoom(message.conversationId))
      .emit('message:new', toMessageEvent(message));

    const participants = [message.senderId, recipientId];
    const views = await Promise.all(
      participants.map((userId) =>
        this.conversations.findOneForUser(message.conversationId, userId),
      ),
    );
    for (const [index, view] of views.entries()) {
      if (!view) continue;
      this.server
        .to(userRoom(participants[index]))
        .emit('conversation:updated', toConversationEvent(view));
    }
  }

  // S3-05: envía la notificación en vivo a la sala personal del destinatario
  @OnDomainEvent('notification.created')
  handleNotificationCreated({
    recipientId,
    notification,
  }: NotificationCreatedEvent): void {
    this.server
      .to(userRoom(recipientId))
      .emit('notification:new', toNotificationEvent(notification));
  }

  // Devuelve el error con el que se rechaza la conexión, o undefined para aceptarla.
  // Nunca registra la cookie ni el token.
  private async authenticate(socket: AppSocket): Promise<Error | undefined> {
    // Un navegador siempre manda Origin en un WebSocket o en una petición de otro sitio; si viene
    // de otro sitio, se rechaza. Sin Origin (un GET del mismo origen o un cliente que no es
    // navegador) se sigue: la cookie decide.
    const origin = socket.handshake.headers.origin;
    if (origin && origin !== this.env.corsOrigin) {
      this.logger.warn(`Socket rechazado por Origin: ${origin}`);
      return new Error('forbidden');
    }

    // cookie-parser, montado en el motor por SocketIoAdapter, dejó las cookies aquí
    const { cookies } = socket.request as { cookies?: Record<string, unknown> };
    const claims = await this.tokens.verify(cookies?.[ACCESS_COOKIE]);
    if (!claims) return new Error('unauthorized');

    socket.data.userId = claims.userId;
    socket.data.expiresAt = claims.expiresAt;
    return undefined;
  }
}

function toMessageEvent(message: MessageData): MessageNewEvent {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}

function toConversationEvent(
  conversation: ConversationDto,
): ConversationUpdatedEvent {
  return {
    id: conversation.id,
    otherUser: conversation.otherUser,
    lastMessage: conversation.lastMessage
      ? toMessageEvent(conversation.lastMessage)
      : null,
    unread: conversation.unread,
  };
}

function toNotificationEvent(
  notification: NotificationData,
): NotificationNewEvent {
  return {
    id: notification.id,
    type: notification.type,
    actor: notification.actor,
    postId: notification.postId,
    commentId: notification.commentId,
    read: notification.read,
    createdAt: notification.createdAt.toISOString(),
  };
}
