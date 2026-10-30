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
import type { LikeChangedEvent } from '../events/domain-events';
import { OnDomainEvent } from '../events/on-domain-event.decorator';
import { PostWatchDto, parseWsDto } from './dto/post-watch.dto';
import {
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SocketData,
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
    await socket.join(dto.postIds.map(postRoom));
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
