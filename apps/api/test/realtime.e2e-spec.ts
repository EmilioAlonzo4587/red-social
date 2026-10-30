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
import {
  type ConversationJoinAck,
  type PresenceWatchAck,
  conversationRoom,
  postRoom,
  userRoom,
} from './../src/realtime/realtime.events';
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

  describe('likes en vivo (S2-03)', () => {
    async function createPost(authorId: string): Promise<string> {
      const post = await app.get(PrismaService).post.create({
        data: { authorId, content: 'Hola en vivo' },
      });
      return post.id;
    }

    async function waitUntilInRoom(
      room: string,
      expectedSocketIds: string[],
    ): Promise<void> {
      const server = app.get(RealtimeGateway).server;
      for (let i = 0; i < 40; i++) {
        const inRoom = await server.in(room).fetchSockets();
        const ids = inRoom.map((s) => s.id).sort();
        if (
          ids.length === expectedSocketIds.length &&
          ids.every((id, idx) => id === [...expectedSocketIds].sort()[idx])
        ) {
          return;
        }
        await new Promise((r) => setTimeout(r, 15));
      }
      throw new Error(`La sala ${room} no alcanzó los sockets esperados`);
    }

    it('dos navegadores suscritos con post:watch reciben post:likes al dar y quitar like', async () => {
      const ana = await registerUser('ana');
      const beto = await registerUser('beto');
      const postId = await createPost(ana.id);

      const nav1 = connect(withCookie(ana.access));
      const nav2 = connect(withCookie(beto.access));
      await waitFor(nav1, ['session:ready']);
      await waitFor(nav2, ['session:ready']);

      nav1.emit('post:watch', { postIds: [postId] });
      nav2.emit('post:watch', { postIds: [postId] });
      await waitUntilInRoom(postRoom(postId), [nav1.id!, nav2.id!]);

      const onLike = Promise.all([
        waitFor(nav1, ['post:likes']),
        waitFor(nav2, ['post:likes']),
      ]);

      await request(app.getHttpServer())
        .put(`/api/posts/${postId}/like`)
        .set('Cookie', `access_token=${beto.access}`)
        .expect(200);

      expect(await onLike).toEqual([
        { event: 'post:likes', data: { postId, likeCount: 1 } },
        { event: 'post:likes', data: { postId, likeCount: 1 } },
      ]);

      const onUnlike = Promise.all([
        waitFor(nav1, ['post:likes']),
        waitFor(nav2, ['post:likes']),
      ]);

      await request(app.getHttpServer())
        .delete(`/api/posts/${postId}/like`)
        .set('Cookie', `access_token=${beto.access}`)
        .expect(200);

      expect(await onUnlike).toEqual([
        { event: 'post:likes', data: { postId, likeCount: 0 } },
        { event: 'post:likes', data: { postId, likeCount: 0 } },
      ]);
    });

    it('post:unwatch saca al socket de la sala y ya no recibe post:likes', async () => {
      const ana = await registerUser('ana');
      const beto = await registerUser('beto');
      const postId = await createPost(ana.id);

      const anaSocket = connect(withCookie(ana.access));
      const betoSocket = connect(withCookie(beto.access));
      await waitFor(anaSocket, ['session:ready']);
      await waitFor(betoSocket, ['session:ready']);

      anaSocket.emit('post:watch', { postIds: [postId] });
      betoSocket.emit('post:watch', { postIds: [postId] });
      await waitUntilInRoom(postRoom(postId), [anaSocket.id!, betoSocket.id!]);

      // Ana deja de mirar la publicación; solo Beto sigue en la sala
      anaSocket.emit('post:unwatch', { postIds: [postId] });
      await waitUntilInRoom(postRoom(postId), [betoSocket.id!]);

      let anaReceived = false;
      anaSocket.once('post:likes', () => {
        anaReceived = true;
      });
      const betoReceived = waitFor(betoSocket, ['post:likes']);

      await request(app.getHttpServer())
        .put(`/api/posts/${postId}/like`)
        .set('Cookie', `access_token=${beto.access}`)
        .expect(200);

      expect(await betoReceived).toEqual({
        event: 'post:likes',
        data: { postId, likeCount: 1 },
      });
      expect(anaReceived).toBe(false);
    });

    it('ignora post:watch con datos inválidos (no UUID)', async () => {
      const ana = await registerUser('ana');
      const socket = connect(withCookie(ana.access));
      await waitFor(socket, ['session:ready']);

      socket.emit('post:watch', { postIds: ['no-es-uuid'] });
      await new Promise((r) => setTimeout(r, 50));

      const server = app.get(RealtimeGateway).server;
      const inInvalidRoom = await server
        .in(postRoom('no-es-uuid'))
        .fetchSockets();
      expect(inInvalidRoom).toHaveLength(0);
    });
  });

  describe('mensajes y notificaciones en vivo (S3-05)', () => {
    async function openConversation(token: string, username: string) {
      const res = await request(app.getHttpServer())
        .post('/api/conversations')
        .set('Cookie', `access_token=${token}`)
        .send({ username })
        .expect(201);
      return (res.body as { id: string }).id;
    }

    function joinConversation(
      socket: Socket,
      payload: unknown,
    ): Promise<ConversationJoinAck> {
      return new Promise((resolve) => {
        socket.emit('conversation:join', payload, resolve);
      });
    }

    it('conversation:join une a quien participa y enviar mensaje emite message:new, conversation:updated y notification:new', async () => {
      const ana = await registerUser('ana');
      const beto = await registerUser('beto');
      const conversationId = await openConversation(ana.access, 'beto');

      const anaSocket = connect(withCookie(ana.access));
      const betoSocket = connect(withCookie(beto.access));
      await waitFor(anaSocket, ['session:ready']);
      await waitFor(betoSocket, ['session:ready']);

      expect(await joinConversation(anaSocket, { conversationId })).toEqual({
        ok: true,
      });
      expect(await joinConversation(betoSocket, { conversationId })).toEqual({
        ok: true,
      });

      const onMessages = Promise.all([
        waitFor(anaSocket, ['message:new']),
        waitFor(betoSocket, ['message:new']),
      ]);
      const onConversations = Promise.all([
        waitFor(anaSocket, ['conversation:updated']),
        waitFor(betoSocket, ['conversation:updated']),
      ]);
      const onBetoNotification = waitFor(betoSocket, ['notification:new']);

      const sent = await request(app.getHttpServer())
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', `access_token=${ana.access}`)
        .send({ content: 'Hola en vivo' })
        .expect(201);

      const expectedMessage = sent.body as {
        id: string;
        conversationId: string;
        senderId: string;
        content: string;
        createdAt: string;
      };
      expect(await onMessages).toEqual([
        { event: 'message:new', data: expectedMessage },
        { event: 'message:new', data: expectedMessage },
      ]);

      const [anaConv, betoConv] = await onConversations;
      // Vista por Ana (remitente): otherUser es Beto y unread es 0
      expect(anaConv).toEqual({
        event: 'conversation:updated',
        data: {
          id: conversationId,
          otherUser: {
            id: beto.id,
            username: 'beto',
            displayName: null,
            avatarPublicId: null,
          },
          lastMessage: expectedMessage,
          unread: 0,
        },
      });
      // Vista por Beto (destinatario): otherUser es Ana y unread es 1
      expect(betoConv).toEqual({
        event: 'conversation:updated',
        data: {
          id: conversationId,
          otherUser: {
            id: ana.id,
            username: 'ana',
            displayName: null,
            avatarPublicId: null,
          },
          lastMessage: expectedMessage,
          unread: 1,
        },
      });

      // Beto también recibe notification:new en su sala personal user:{id}
      expect(await onBetoNotification).toEqual({
        event: 'notification:new',
        data: expect.objectContaining({
          type: 'message',
          actor: {
            id: ana.id,
            username: 'ana',
            displayName: null,
            avatarPublicId: null,
          },
          postId: null,
          commentId: null,
          read: false,
        }) as unknown,
      });
    });

    it('conversation:join rechaza con "forbidden" a quien no participa, una conversación inexistente o un UUID inválido (RN09)', async () => {
      const ana = await registerUser('ana');
      await registerUser('beto');
      const carla = await registerUser('carla');
      const conversationId = await openConversation(ana.access, 'beto');

      const carlaSocket = connect(withCookie(carla.access));
      await waitFor(carlaSocket, ['session:ready']);

      const missingId = '019a319c-4910-7000-8000-000000000999';
      for (const payload of [
        { conversationId },
        { conversationId: missingId },
        { conversationId: 'no-es-uuid' },
        {},
      ]) {
        expect(await joinConversation(carlaSocket, payload)).toEqual({
          ok: false,
          error: 'forbidden',
        });
      }

      const server = app.get(RealtimeGateway).server;
      expect(
        await server.in(conversationRoom(conversationId)).fetchSockets(),
      ).toHaveLength(0);

      let carlaReceived = false;
      carlaSocket.once('message:new', () => {
        carlaReceived = true;
      });
      await request(app.getHttpServer())
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', `access_token=${ana.access}`)
        .send({ content: 'Mensaje privado' })
        .expect(201);
      await new Promise((r) => setTimeout(r, 50));
      expect(carlaReceived).toBe(false);
    });

    function sendMessage(
      token: string,
      conversationId: string,
      content: string,
    ) {
      return request(app.getHttpServer())
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', `access_token=${token}`)
        .send({ content })
        .expect(201);
    }

    // Espera un poco y confirma que el evento nunca llegó a ese socket
    async function expectNothing(socket: Socket, event: string) {
      let received = false;
      const mark = () => {
        received = true;
      };
      socket.on(event, mark);
      await new Promise((r) => setTimeout(r, 100));
      socket.off(event, mark);
      expect(received).toBe(false);
    }

    it('conversation:typing llega solo al otro participante y se ignora de quien no está en la sala (S3-06)', async () => {
      const ana = await registerUser('ana');
      const beto = await registerUser('beto');
      const carla = await registerUser('carla');
      const conversationId = await openConversation(ana.access, 'beto');

      const anaSocket = connect(withCookie(ana.access));
      const betoSocket = connect(withCookie(beto.access));
      const carlaSocket = connect(withCookie(carla.access));
      await Promise.all(
        [anaSocket, betoSocket, carlaSocket].map((socket) =>
          waitFor(socket, ['session:ready']),
        ),
      );
      await joinConversation(anaSocket, { conversationId });
      await joinConversation(betoSocket, { conversationId });

      // Carla no participa: su aviso no llega a nadie
      carlaSocket.emit('conversation:typing', { conversationId });
      await expectNothing(betoSocket, 'conversation:typing');

      const onBeto = waitFor(betoSocket, ['conversation:typing']);
      const anaEcho = expectNothing(anaSocket, 'conversation:typing');
      anaSocket.emit('conversation:typing', { conversationId });
      expect(await onBeto).toEqual({
        event: 'conversation:typing',
        data: { conversationId, userId: ana.id },
      });
      await anaEcho;
    });

    it('marcar como leída emite conversation:read a la sala y se repite al unirse (S3-06)', async () => {
      const ana = await registerUser('ana');
      const beto = await registerUser('beto');
      const conversationId = await openConversation(ana.access, 'beto');
      await sendMessage(ana.access, conversationId, 'Hola');

      const anaSocket = connect(withCookie(ana.access));
      await waitFor(anaSocket, ['session:ready']);
      await joinConversation(anaSocket, { conversationId });

      const onRead = waitFor(anaSocket, ['conversation:read']);
      await request(app.getHttpServer())
        .post(`/api/conversations/${conversationId}/read`)
        .set('Cookie', `access_token=${beto.access}`)
        .expect(204);
      const live = await onRead;
      expect(live).toEqual({
        event: 'conversation:read',
        data: {
          conversationId,
          userId: beto.id,
          readAt: expect.any(String) as unknown,
        },
      });

      // Una pestaña nueva de Ana recibe el "Visto" de Beto al unirse
      const anaTab = connect(withCookie(ana.access));
      await waitFor(anaTab, ['session:ready']);
      const onJoinRead = waitFor(anaTab, ['conversation:read']);
      await joinConversation(anaTab, { conversationId });
      expect(await onJoinRead).toEqual(live);
    });

    it('presence:watch solo revela contactos del chat y avisa cuando se desconectan (S3-06)', async () => {
      const ana = await registerUser('ana');
      const beto = await registerUser('beto');
      const carla = await registerUser('carla');
      await openConversation(ana.access, 'beto');

      const anaSocket = connect(withCookie(ana.access));
      const betoSocket = connect(withCookie(beto.access));
      const carlaSocket = connect(withCookie(carla.access));
      await Promise.all(
        [anaSocket, betoSocket, carlaSocket].map((socket) =>
          waitFor(socket, ['session:ready']),
        ),
      );

      // Carla está conectada, pero no tiene conversación con Ana: no aparece
      const ack = await new Promise<PresenceWatchAck>((resolve) => {
        anaSocket.emit(
          'presence:watch',
          { userIds: [beto.id, carla.id] },
          resolve,
        );
      });
      expect(ack).toEqual({ onlineUserIds: [beto.id] });

      const onPresence = waitFor(anaSocket, ['user:presence']);
      const carlaGone = expectNothing(anaSocket, 'user:presence');
      carlaSocket.disconnect();
      await carlaGone;
      betoSocket.disconnect();
      expect(await onPresence).toEqual({
        event: 'user:presence',
        data: { userId: beto.id, online: false },
      });
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
