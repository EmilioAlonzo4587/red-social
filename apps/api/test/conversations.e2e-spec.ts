import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request, { type Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import type { MeDto } from './../src/auth/dto/me.dto';
import type { ErrorResponseDto } from './../src/common/dto/error-response.dto';
import { configureApp } from './../src/configure-app';
import type {
  ConversationDto,
  MessageDto,
  MessagePageDto,
} from './../src/conversations/dto/conversation.dto';
import { DomainEvents } from './../src/events/domain-events.service';
import { NotificationsListener } from './../src/notifications/notifications.listener';
import { PrismaService } from './../src/prisma/prisma.service';
import { cookiesOf } from './utils/cookies';
import { resetDatabase } from './utils/database';

const conversationOf = (res: Response) => res.body as ConversationDto;
const inboxOf = (res: Response) => res.body as ConversationDto[];
const messageOf = (res: Response) => res.body as MessageDto;
const pageOf = (res: Response) => res.body as MessagePageDto;
const meOf = (res: Response) => res.body as MeDto;
const ruleOf = (res: Response, field: string) =>
  (res.body as ErrorResponseDto).details.find((d) => d.field === field)?.rule;

const MISSING_ID = '01a17fbf-5024-7141-88aa-8c7e3ffa3259';

describe('Chat (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  let emit: jest.SpyInstance;
  // Otra IP por prueba para no cruzar el límite de 5 registros por minuto (ver auth.e2e-spec.ts)
  let ipCounter = 0;
  let ip: string;

  async function signUp(username: string) {
    const res = await request(server)
      .post('/api/auth/register')
      .set('X-Forwarded-For', ip)
      .send({
        username,
        email: `${username}@example.com`,
        password: 'una-clave-larga',
      })
      .expect(201);
    return {
      id: meOf(res).id,
      username,
      cookie: `access_token=${cookiesOf(res).access_token.value}`,
    };
  }

  type User = Awaited<ReturnType<typeof signUp>>;

  // Sin async: devuelve el Test de supertest para poder encadenar .expect()
  function open(from: User, to: string) {
    return request(server)
      .post('/api/conversations')
      .set('Cookie', from.cookie)
      .send({ username: to });
  }

  async function openId(from: User, to: User) {
    return conversationOf(await open(from, to.username)).id;
  }

  async function send(from: User, conversationId: string, content: string) {
    const res = await request(server)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Cookie', from.cookie)
      .send({ content })
      .expect(201);
    return messageOf(res);
  }

  const inbox = async (user: User) =>
    inboxOf(
      await request(server)
        .get('/api/conversations')
        .set('Cookie', user.cookie)
        .expect(200),
    );

  beforeAll(async () => {
    // Sin el listener de notificaciones: escribiría y emitiría notification.created después de
    // responder, y las cuentas de emit dependerían de cuándo termina. La notificación de un
    // mensaje se prueba en notifications.e2e-spec.ts.
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(NotificationsListener)
      .useValue({})
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    emit = jest.spyOn(app.get(DomainEvents), 'emit');
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    ip = `10.0.10.${++ipCounter}`;
    emit.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/conversations', () => {
    it('201 la primera vez y 200 después, desde cualquiera de los dos y con otras mayúsculas', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');

      const first = await open(ana, 'beto').expect(201);
      expect(conversationOf(first)).toEqual({
        id: expect.any(String) as string,
        otherUser: {
          id: beto.id,
          username: 'beto',
          displayName: null,
          avatarPublicId: null,
        },
        lastMessage: null,
        unread: 0,
      });

      const again = await open(ana, 'BETO').expect(200);
      const fromBeto = await open(beto, 'ana_lopez').expect(200);
      expect(conversationOf(again).id).toBe(conversationOf(first).id);
      expect(conversationOf(fromBeto).id).toBe(conversationOf(first).id);
      expect(conversationOf(fromBeto).otherUser.id).toBe(ana.id);

      // Una sola fila por pareja, guardada en orden (CHECK user_a_id < user_b_id)
      const rows = await prisma.conversation.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0].userAId < rows[0].userBId).toBe(true);
    });

    it('dos aperturas al mismo tiempo crean una sola conversación', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');

      const [a, b] = await Promise.all([
        open(ana, 'beto'),
        open(beto, 'ana_lopez'),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 201]);
      expect(conversationOf(a).id).toBe(conversationOf(b).id);
      expect(await prisma.conversation.count()).toBe(1);
    });

    it('400 consigo mismo o sin username', async () => {
      const ana = await signUp('ana_lopez');

      const self = await open(ana, 'ANA_LOPEZ').expect(400);
      expect(ruleOf(self, 'username')).toBe('notSelf');

      const empty = await open(ana, '   ').expect(400);
      expect(ruleOf(empty, 'username')).toBe('isNotEmpty');
      expect(await prisma.conversation.count()).toBe(0);
    });

    it('404 si el usuario no existe', async () => {
      const ana = await signUp('ana_lopez');
      await open(ana, 'nadie').expect(404);
    });

    it('401 sin sesión', async () => {
      await request(server)
        .post('/api/conversations')
        .send({ username: 'beto' })
        .expect(401);
    });
  });

  describe('POST /api/conversations/:id/messages', () => {
    it('201: guarda el texto recortado, lo pone primero en la bandeja y emite message.created', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const id = await openId(ana, beto);

      const res = await request(server)
        .post(`/api/conversations/${id}/messages`)
        .set('Cookie', ana.cookie)
        .send({ content: '  Hola Beto  ' })
        .expect(201);
      const message = messageOf(res);
      expect(message).toEqual({
        id: expect.any(String) as string,
        conversationId: id,
        senderId: ana.id,
        content: 'Hola Beto',
        createdAt: expect.any(String) as string,
      });

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('message.created', {
        recipientId: beto.id,
        message: expect.objectContaining({
          id: message.id,
          conversationId: id,
          senderId: ana.id,
          content: 'Hola Beto',
        }) as MessageDto,
      });

      const [row] = await inbox(beto);
      expect(row.lastMessage?.id).toBe(message.id);
    });

    it('400 vacío, solo espacios o de más de 2000 caracteres (RN09)', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const id = await openId(ana, beto);

      for (const content of ['', '   ', 'x'.repeat(2001)]) {
        const res = await request(server)
          .post(`/api/conversations/${id}/messages`)
          .set('Cookie', ana.cookie)
          .send({ content })
          .expect(400);
        expect(ruleOf(res, 'content')).toBeDefined();
      }
      await send(ana, id, 'x'.repeat(2000));
      expect(await prisma.message.count()).toBe(1);
    });

    it('400 si intenta elegir el remitente', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const id = await openId(ana, beto);

      const res = await request(server)
        .post(`/api/conversations/${id}/messages`)
        .set('Cookie', ana.cookie)
        .send({ content: 'Hola', senderId: beto.id })
        .expect(400);
      expect(ruleOf(res, 'senderId')).toBe('whitelistValidation');
    });

    it('403 si no participa (RN09) y 404 si no existe', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const carla = await signUp('carla');
      const id = await openId(ana, beto);

      await request(server)
        .post(`/api/conversations/${id}/messages`)
        .set('Cookie', carla.cookie)
        .send({ content: 'Me meto' })
        .expect(403);
      await request(server)
        .post(`/api/conversations/${MISSING_ID}/messages`)
        .set('Cookie', ana.cookie)
        .send({ content: 'Hola' })
        .expect(404);
      await request(server)
        .post('/api/conversations/no-es-uuid/messages')
        .set('Cookie', ana.cookie)
        .send({ content: 'Hola' })
        .expect(400);
      expect(await prisma.message.count()).toBe(0);
      expect(emit).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/conversations', () => {
    it('solo con mensajes, ordenada por el último mensaje y con los no leídos de cada uno', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const carla = await signUp('carla');
      const dani = await signUp('dani');

      const conBeto = await openId(ana, beto);
      const conCarla = await openId(ana, carla);
      await openId(ana, dani); // sin mensajes: no aparece

      await send(beto, conBeto, 'Hola Ana');
      await send(beto, conBeto, '¿Estás?');
      await send(carla, conCarla, 'Buenas');

      const rows = await inbox(ana);
      expect(rows.map((c) => c.otherUser.username)).toEqual(['carla', 'beto']);
      expect(rows.map((c) => c.unread)).toEqual([1, 2]);
      expect(rows[1].lastMessage?.content).toBe('¿Estás?');

      // Quien escribe no tiene no leídos de sus propios mensajes
      const [betoRow] = await inbox(beto);
      expect(betoRow.otherUser.username).toBe('ana_lopez');
      expect(betoRow.unread).toBe(0);

      // Responder marca como leído lo anterior y sube la conversación
      await send(ana, conBeto, 'Aquí estoy');
      const after = await inbox(ana);
      expect(after.map((c) => c.otherUser.username)).toEqual(['beto', 'carla']);
      expect(after[0].unread).toBe(0);

      expect(await inbox(dani)).toEqual([]);
    });

    it('401 sin sesión', async () => {
      await request(server).get('/api/conversations').expect(401);
    });
  });

  describe('GET /api/conversations/:id/messages', () => {
    it('del más reciente al más antiguo, de 20 en 20 con cursor', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const id = await openId(ana, beto);
      for (let i = 1; i <= 25; i++) {
        await send(i % 2 ? ana : beto, id, `m${i}`);
      }

      const first = pageOf(
        await request(server)
          .get(`/api/conversations/${id}/messages`)
          .set('Cookie', beto.cookie)
          .expect(200),
      );
      expect(first.items).toHaveLength(20);
      expect(first.items[0].content).toBe('m25');
      expect(first.nextCursor).not.toBeNull();

      const second = pageOf(
        await request(server)
          .get(`/api/conversations/${id}/messages`)
          .query({ cursor: first.nextCursor })
          .set('Cookie', beto.cookie)
          .expect(200),
      );
      expect(second.items.map((m) => m.content)).toEqual([
        'm5',
        'm4',
        'm3',
        'm2',
        'm1',
      ]);
      expect(second.nextCursor).toBeNull();
    });

    it('400 con un cursor que la api no generó', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const id = await openId(ana, beto);

      const res = await request(server)
        .get(`/api/conversations/${id}/messages`)
        .query({ cursor: 'inventado' })
        .set('Cookie', ana.cookie)
        .expect(400);
      expect(ruleOf(res, 'cursor')).toBe('cursor');
    });

    it('403 si no participa (RN09) y 404 si no existe', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const carla = await signUp('carla');
      const id = await openId(ana, beto);
      await send(ana, id, 'Privado');

      await request(server)
        .get(`/api/conversations/${id}/messages`)
        .set('Cookie', carla.cookie)
        .expect(403);
      await request(server)
        .get(`/api/conversations/${MISSING_ID}/messages`)
        .set('Cookie', ana.cookie)
        .expect(404);
    });
  });

  describe('POST /api/conversations/:id/read', () => {
    it('204: deja en 0 los no leídos; un mensaje posterior vuelve a contar', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const id = await openId(ana, beto);
      await send(beto, id, 'Uno');
      await send(beto, id, 'Dos');
      expect((await inbox(ana))[0].unread).toBe(2);

      await request(server)
        .post(`/api/conversations/${id}/read`)
        .set('Cookie', ana.cookie)
        .expect(204);
      expect((await inbox(ana))[0].unread).toBe(0);

      await send(beto, id, 'Tres');
      expect((await inbox(ana))[0].unread).toBe(1);
      // Leer no cambia los no leídos del otro
      expect((await inbox(beto))[0].unread).toBe(0);
    });

    it('204 sin mensajes todavía', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const id = await openId(ana, beto);
      await request(server)
        .post(`/api/conversations/${id}/read`)
        .set('Cookie', ana.cookie)
        .expect(204);
    });

    it('403 si no participa (RN09) y 404 si no existe', async () => {
      const ana = await signUp('ana_lopez');
      const beto = await signUp('beto');
      const carla = await signUp('carla');
      const id = await openId(ana, beto);

      await request(server)
        .post(`/api/conversations/${id}/read`)
        .set('Cookie', carla.cookie)
        .expect(403);
      await request(server)
        .post(`/api/conversations/${MISSING_ID}/read`)
        .set('Cookie', ana.cookie)
        .expect(404);
    });
  });
});
