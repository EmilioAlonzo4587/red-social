import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import type { MeDto } from './../src/auth/dto/me.dto';
import { configureApp } from './../src/configure-app';
import { PrismaService } from './../src/prisma/prisma.service';
import { userRoom } from './../src/realtime/realtime.events';
import { RealtimeGateway } from './../src/realtime/realtime.gateway';
import { cookiesOf } from './utils/cookies';
import { resetDatabase } from './utils/database';

const WEB_ORIGIN = 'http://localhost:3001'; // CORS_ORIGIN de test/setup-env.ts

describe('Socket.io autenticado (e2e)', () => {
  let app: NestExpressApplication;
  let url: string;
  let ipCounter = 0;
  // Sockets abiertos en cada prueba, para cerrarlos al final
  const sockets: Socket[] = [];

  // Registra un usuario y devuelve su id y su JWT de acceso
  async function registerUser(username: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('X-Forwarded-For', `10.1.0.${++ipCounter}`)
      .send({
        username,
        email: `${username}@example.com`,
        password: 'una-clave-larga',
      })
      .expect(201);
    return {
      id: (res.body as MeDto).id,
      access: cookiesOf(res).access_token.value,
    };
  }

  // Abre un socket como lo haría la web. En Node no hay navegador que ponga la cookie,
  // así que se manda a mano en la cabecera Cookie del handshake.
  function connect(headers: Record<string, string> = {}): Socket {
    const socket = io(url, {
      extraHeaders: headers,
      reconnection: false, // en las pruebas, un rechazo es el resultado, no algo que reintentar
      forceNew: true,
    });
    sockets.push(socket);
    return socket;
  }

  // Espera el primer evento entre los dados y devuelve cuál llegó y con qué datos
  function waitFor(
    socket: Socket,
    events: string[],
  ): Promise<{ event: string; data: unknown }> {
    return new Promise((resolve) => {
      for (const event of events) {
        socket.once(event, (data: unknown) => resolve({ event, data }));
      }
    });
  }

  const withCookie = (token: string) => ({ Cookie: `access_token=${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    // Puerto 0: el sistema elige uno libre. A diferencia de las otras e2e, aquí hace falta
    // un servidor escuchando de verdad, porque socket.io-client se conecta por red.
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://localhost:${port}`;
  });

  beforeEach(async () => {
    await resetDatabase(app.get(PrismaService));
  });

  afterEach(() => {
    sockets.splice(0).forEach((socket) => socket.disconnect());
  });

  afterAll(async () => {
    await app.close();
  });

  describe('handshake', () => {
    it('con sesión: conecta y recibe session:ready con su id', async () => {
      const ana = await registerUser('ana');
      const socket = connect(withCookie(ana.access));
      const result = await waitFor(socket, ['session:ready', 'connect_error']);
      expect(result).toEqual({
        event: 'session:ready',
        data: { userId: ana.id },
      });
    });

    it('rechaza sin cookie con "unauthorized"', async () => {
      const socket = connect();
      const { event, data } = await waitFor(socket, [
        'session:ready',
        'connect_error',
      ]);
      expect(event).toBe('connect_error');
      expect((data as Error).message).toBe('unauthorized');
    });

    it('rechaza un token falso o vencido con "unauthorized"', async () => {
      const ana = await registerUser('ana');
      const expired = await app
        .get(JwtService)
        .signAsync({ sub: ana.id }, { expiresIn: -10 });

      for (const token of ['falso', expired]) {
        const socket = connect(withCookie(token));
        const { event, data } = await waitFor(socket, [
          'session:ready',
          'connect_error',
        ]);
        expect(event).toBe('connect_error');
        expect((data as Error).message).toBe('unauthorized');
      }
    });

    it('rechaza otro Origin con "forbidden" aunque la cookie sea válida', async () => {
      const ana = await registerUser('ana');
      const socket = connect({
        ...withCookie(ana.access),
        Origin: 'https://sitio-ajeno.example',
      });
      const { event, data } = await waitFor(socket, [
        'session:ready',
        'connect_error',
      ]);
      expect(event).toBe('connect_error');
      expect((data as Error).message).toBe('forbidden');
    });

    it('acepta el Origin de la web (CORS_ORIGIN)', async () => {
      const ana = await registerUser('ana');
      const socket = connect({ ...withCookie(ana.access), Origin: WEB_ORIGIN });
      const { event } = await waitFor(socket, [
        'session:ready',
        'connect_error',
      ]);
      expect(event).toBe('session:ready');
    });

    it('con solo WebSocket, sin polling, también lee la cookie', async () => {
      const ana = await registerUser('ana');
      const socket = io(url, {
        extraHeaders: withCookie(ana.access),
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });
      sockets.push(socket);
      const { event } = await waitFor(socket, [
        'session:ready',
        'connect_error',
      ]);
      expect(event).toBe('session:ready');
    });
  });

  describe('sala user:{id}', () => {
    it('cada usuario está solo en su sala', async () => {
      const ana = await registerUser('ana');
      const beto = await registerUser('beto');
      const anaSocket = connect(withCookie(ana.access));
      const betoSocket = connect(withCookie(beto.access));
      await waitFor(anaSocket, ['session:ready']);
      await waitFor(betoSocket, ['session:ready']);

      const server = app.get(RealtimeGateway).server;
      const inAnaRoom = await server.in(userRoom(ana.id)).fetchSockets();
      // El socket de Beto no está en la sala de Ana (caso prohibido)
      expect(inAnaRoom.map((s) => s.id)).toEqual([anaSocket.id]);
    });

    it('un evento emitido a la sala llega a todas las pestañas del usuario', async () => {
      const ana = await registerUser('ana');
      const tab1 = connect(withCookie(ana.access));
      const tab2 = connect(withCookie(ana.access));
      await waitFor(tab1, ['session:ready']);
      await waitFor(tab2, ['session:ready']);

      const received = Promise.all([
        waitFor(tab1, ['session:ready']),
        waitFor(tab2, ['session:ready']),
      ]);
      app
        .get(RealtimeGateway)
        .server.to(userRoom(ana.id))
        .emit('session:ready', { userId: ana.id });
      expect(await received).toHaveLength(2);
    });
  });

  it('desconecta el socket cuando vence el JWT', async () => {
    const ana = await registerUser('ana');
    // JWT de 2 segundos: el servidor debe cerrar el socket al vencer
    const shortLived = await app
      .get(JwtService)
      .signAsync({ sub: ana.id }, { expiresIn: 2 });
    const socket = connect(withCookie(shortLived));
    await waitFor(socket, ['session:ready']);

    const reason = await new Promise<string>((resolve) =>
      socket.once('disconnect', resolve),
    );
    // "io server disconnect": lo cerró el servidor. El cliente no reconecta solo en este caso.
    expect(reason).toBe('io server disconnect');
  }, 10_000);
});
