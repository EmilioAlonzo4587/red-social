import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import type { MeDto } from '../../src/auth/dto/me.dto';
import { configureApp } from '../../src/configure-app';
import { RealtimeGateway } from '../../src/realtime/realtime.gateway';
import { cookiesOf } from './cookies';

// Lo que comparten las e2e de flujos completos (S4-01): HTTP y Socket.io contra la misma api.

export interface FlowApp {
  app: NestExpressApplication;
  url: string;
}

// La api escuchando en un puerto libre (0): socket.io-client se conecta por red, no en memoria
export async function startFlowApp(): Promise<FlowApp> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.listen(0);
  const { port } = app.getHttpServer().address() as AddressInfo;
  return { app, url: `http://localhost:${port}` };
}

export interface FlowUser {
  id: string;
  username: string;
  password: string;
  access: string;
  refresh: string;
  // Cabecera Cookie con access_token, como la manda el navegador
  cookie: string;
}

let ipCounter = 0;

// Cada registro desde otra IP, para no cruzar el límite de 5 por minuto (RN13)
export function nextIp(): string {
  ipCounter += 1;
  return `10.4.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
}

export async function signUp(
  app: NestExpressApplication,
  username: string,
): Promise<FlowUser> {
  const password = 'una-clave-larga';
  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .set('X-Forwarded-For', nextIp())
    .send({ username, email: `${username}@example.com`, password })
    .expect(201);
  const cookies = cookiesOf(res);
  return {
    id: (res.body as MeDto).id,
    username,
    password,
    access: cookies.access_token.value,
    refresh: cookies.refresh_token.value,
    cookie: `access_token=${cookies.access_token.value}`,
  };
}

const WEB_ORIGIN = 'http://localhost:3001'; // CORS_ORIGIN de test/setup-env.ts

// Un socket como el de la web, ya autenticado (espera session:ready)
export async function connectSocket(
  url: string,
  user: FlowUser,
  sockets: Socket[],
): Promise<Socket> {
  const socket = io(url, {
    extraHeaders: { Cookie: user.cookie, Origin: WEB_ORIGIN },
    reconnection: false,
    forceNew: true,
  });
  sockets.push(socket);
  await waitForEvent(socket, 'session:ready');
  return socket;
}

// post:watch no responde: se espera a que el socket ya esté en la sala antes de seguir,
// si no, un like que llega antes pasaría sin que el socket lo viera
export async function waitUntilInRoom(
  app: NestExpressApplication,
  room: string,
  socket: Socket,
): Promise<void> {
  const server = app.get(RealtimeGateway).server;
  for (let i = 0; i < 100; i++) {
    const inRoom = await server.in(room).fetchSockets();
    if (inRoom.some((s) => s.id === socket.id)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`El socket no entró a ${room}`);
}

// El próximo evento con ese nombre, o falla si no llega a tiempo
export function waitForEvent<T = unknown>(
  socket: Socket,
  event: string,
  timeoutMs = 3000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`No llegó ${event} en ${timeoutMs} ms`)),
      timeoutMs,
    );
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}
