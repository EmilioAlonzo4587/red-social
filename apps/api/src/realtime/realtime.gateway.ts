import { Inject, Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { DefaultEventsMap, Server, Socket } from 'socket.io';
import { ACCESS_COOKIE } from '../auth/cookies';
import { SessionTokenService } from '../auth/session-token.service';
import { ENV, type Env } from '../config/env';
import {
  type ServerToClientEvents,
  type SocketData,
  userRoom,
} from './realtime.events';

// Los eventos cliente → servidor llegan con S2-03 (post:watch) y S3-05 (conversation:join)
type AppServer = Server<
  DefaultEventsMap,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>;
type AppSocket = Socket<
  DefaultEventsMap,
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
