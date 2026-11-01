import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Socket } from 'socket.io-client';
import request, { type Response } from 'supertest';
import type { MeDto } from './../src/auth/dto/me.dto';
import type {
  ConversationDto,
  MessageDto,
  MessagePageDto,
} from './../src/conversations/dto/conversation.dto';
import { PrismaService } from './../src/prisma/prisma.service';
import type {
  ConversationReadSocketEvent,
  ConversationUpdatedEvent,
  MessageNewEvent,
} from './../src/realtime/realtime.events';
import { cookiesOf } from './utils/cookies';
import { resetDatabase } from './utils/database';
import {
  connectSocket,
  nextIp,
  signUp,
  startFlowApp,
  waitForEvent,
} from './utils/flow';

// Flujo crítico de sesión y chat (S4-01, Dev 3): la vida de una sesión como la maneja la web
// (registro, token vencido, refresh, logout y login) y una conversación entre dos personas,
// con los mensajes por HTTP y los avisos por Socket.io.
describe('Flujo de sesión y chat (e2e)', () => {
  let app: NestExpressApplication;
  let url: string;
  const sockets: Socket[] = [];

  const http = () => request(app.getHttpServer());
  const bodyOf = <T>(res: Response) => res.body as T;
  const me = (access: string) =>
    http().get('/api/auth/me').set('Cookie', `access_token=${access}`);
  const refresh = (token: string) =>
    http().post('/api/auth/refresh').set('Cookie', `refresh_token=${token}`);

  beforeAll(async () => {
    ({ app, url } = await startFlowApp());
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

  it('registro, token vencido, refresh, reutilización (RN12), logout y login de punta a punta', async () => {
    // 1. Registrarse ya inicia sesión
    const ana = await signUp(app, 'ana_lopez');
    expect(bodyOf<MeDto>(await me(ana.access).expect(200)).username).toBe(
      'ana_lopez',
    );

    // 2. A los 15 minutos el JWT vence: la ruta responde 401
    const expired = await app
      .get(JwtService)
      .signAsync({ sub: ana.id }, { expiresIn: -10 });
    await me(expired).expect(401);

    // 3. La web llama una vez a refresh: cookies nuevas y la sesión sigue
    const renewed = cookiesOf(await refresh(ana.refresh).expect(204));
    expect(renewed.refresh_token.value).not.toBe(ana.refresh);
    expect(renewed.refresh_token.attributes).toContain('Path=/api/auth');
    expect(renewed.access_token.attributes).toContain('HttpOnly');
    await me(renewed.access_token.value).expect(200);

    // 4. Alguien reutiliza el refresh viejo: 401 y se cierran todas las sesiones (RN12)
    const reuse = await refresh(ana.refresh).expect(401);
    expect(cookiesOf(reuse).refresh_token.value).toBe('');
    await refresh(renewed.refresh_token.value).expect(401);

    // 5. Ana vuelve a entrar con su contraseña, por correo
    const login = await http()
      .post('/api/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ identifier: 'ana_lopez@example.com', password: ana.password })
      .expect(200);
    const session = cookiesOf(login);
    await me(session.access_token.value).expect(200);

    // 6. Cierra sesión: borra las cookies y el refresh deja de servir
    const logout = await http()
      .post('/api/auth/logout')
      .set('Cookie', `refresh_token=${session.refresh_token.value}`)
      .expect(204);
    expect(cookiesOf(logout).access_token.value).toBe('');
    await refresh(session.refresh_token.value).expect(401);

    // 7. Sin cookie, la sesión terminó
    await http().get('/api/auth/me').expect(401);
  });

  it('chat entre dos personas: abrir, unirse, mensajes en vivo, no leídos, visto y respuesta', async () => {
    const ana = await signUp(app, 'ana_lopez');
    const beto = await signUp(app, 'beto_ruiz');
    const anaSocket = await connectSocket(url, ana, sockets);
    const betoSocket = await connectSocket(url, beto, sockets);

    // 1. Ana abre el chat con Beto desde su perfil: 201 la primera vez, 200 después
    const opened = bodyOf<ConversationDto>(
      await http()
        .post('/api/conversations')
        .set('Cookie', ana.cookie)
        .send({ username: 'BETO_RUIZ' })
        .expect(201),
    );
    expect(opened).toMatchObject({
      otherUser: { id: beto.id },
      lastMessage: null,
      unread: 0,
    });
    const again = bodyOf<ConversationDto>(
      await http()
        .post('/api/conversations')
        .set('Cookie', beto.cookie)
        .send({ username: ana.username })
        .expect(200),
    );
    expect(again.id).toBe(opened.id);

    // 2. Los dos abren la conversación: entran a la sala
    for (const socket of [anaSocket, betoSocket]) {
      const ack: unknown = await socket.emitWithAck('conversation:join', {
        conversationId: opened.id,
      });
      expect(ack).toEqual({ ok: true });
    }

    // 3. Ana escribe: el mensaje llega en vivo y la bandeja de Beto se actualiza con 1 sin leer
    const betoMessage = waitForEvent<MessageNewEvent>(
      betoSocket,
      'message:new',
    );
    const betoInbox = waitForEvent<ConversationUpdatedEvent>(
      betoSocket,
      'conversation:updated',
    );
    const sent = bodyOf<MessageDto>(
      await http()
        .post(`/api/conversations/${opened.id}/messages`)
        .set('Cookie', ana.cookie)
        .send({ content: '  Hola, ¿cómo vas?  ' })
        .expect(201),
    );
    expect(sent).toMatchObject({
      senderId: ana.id,
      content: 'Hola, ¿cómo vas?',
    });
    expect(await betoMessage).toMatchObject({ id: sent.id, senderId: ana.id });
    expect(await betoInbox).toMatchObject({
      id: opened.id,
      otherUser: { id: ana.id },
      lastMessage: { id: sent.id },
      unread: 1,
    });

    // 4. Beto lo lee: Ana recibe "Visto" y el contador de Beto vuelve a 0
    const seen = waitForEvent<ConversationReadSocketEvent>(
      anaSocket,
      'conversation:read',
    );
    await http()
      .post(`/api/conversations/${opened.id}/read`)
      .set('Cookie', beto.cookie)
      .expect(204);
    expect(await seen).toMatchObject({
      conversationId: opened.id,
      userId: beto.id,
    });
    const inboxAfterRead = bodyOf<ConversationDto[]>(
      await http()
        .get('/api/conversations')
        .set('Cookie', beto.cookie)
        .expect(200),
    );
    expect(inboxAfterRead).toMatchObject([{ id: opened.id, unread: 0 }]);

    // 5. Beto responde: a Ana le llega y su bandeja tiene 1 sin leer
    const anaMessage = waitForEvent<MessageNewEvent>(anaSocket, 'message:new');
    await http()
      .post(`/api/conversations/${opened.id}/messages`)
      .set('Cookie', beto.cookie)
      .send({ content: 'Bien, ¿y tú?' })
      .expect(201);
    expect(await anaMessage).toMatchObject({
      senderId: beto.id,
      content: 'Bien, ¿y tú?',
    });
    const anaInbox = bodyOf<ConversationDto[]>(
      await http()
        .get('/api/conversations')
        .set('Cookie', ana.cookie)
        .expect(200),
    );
    expect(anaInbox).toMatchObject([
      {
        id: opened.id,
        otherUser: { id: beto.id },
        lastMessage: { content: 'Bien, ¿y tú?' },
        unread: 1,
      },
    ]);

    // 6. El historial, del más reciente al más antiguo, tiene los dos mensajes
    const history = bodyOf<MessagePageDto>(
      await http()
        .get(`/api/conversations/${opened.id}/messages`)
        .set('Cookie', ana.cookie)
        .expect(200),
    );
    expect(history.items.map((m) => m.content)).toEqual([
      'Bien, ¿y tú?',
      'Hola, ¿cómo vas?',
    ]);
    expect(history.nextCursor).toBeNull();

    // 7. Un mensaje no crea notificación (S4-15): el aviso sale de conversation:updated
    const unread = await http()
      .get('/api/notifications/unread-count')
      .set('Cookie', ana.cookie)
      .expect(200);
    expect(unread.body).toEqual({ count: 0 });
  });
});
