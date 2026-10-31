import { ConversationJoinDto } from './dto/conversation-join.dto';
import {
  MAX_WATCH_POST_IDS,
  PostWatchDto,
  parseWsDto,
} from './dto/post-watch.dto';
import {
  conversationRoom,
  postRoom,
  presenceRoom,
  userRoom,
} from './realtime.events';
import {
  MAX_JOINED_CONVERSATIONS_PER_SOCKET,
  MAX_WATCHED_POSTS_PER_SOCKET,
  MAX_WATCHED_PRESENCE_PER_SOCKET,
  RealtimeGateway,
  msUntilExpiry,
} from './realtime.gateway';

const VALID_ID_1 = '019a319c-4910-7000-8000-000000000001';
const VALID_ID_2 = '019a319c-4910-7000-8000-000000000002';

describe('msUntilExpiry', () => {
  const now = 1_000_000;

  it('lo que falta para el vencimiento', () => {
    expect(msUntilExpiry(now + 900_000, now)).toBe(900_000);
  });

  it('0 si ya venció', () => {
    expect(msUntilExpiry(now - 5, now)).toBe(0);
  });

  it('no pasa del máximo de setTimeout (unos 24 días)', () => {
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    expect(msUntilExpiry(now + thirtyDays, now)).toBe(2 ** 31 - 1);
  });
});

describe('PostWatchDto (parseWsDto)', () => {
  it('acepta una lista válida de UUIDs', () => {
    const dto = parseWsDto(PostWatchDto, { postIds: [VALID_ID_1, VALID_ID_2] });
    expect(dto?.postIds).toEqual([VALID_ID_1, VALID_ID_2]);
  });

  it('rechaza payloads vacíos, con ids no UUID, campos extra o más del límite', () => {
    const tooMany = Array.from(
      { length: MAX_WATCH_POST_IDS + 1 },
      () => VALID_ID_1,
    );
    for (const invalid of [
      null,
      undefined,
      'texto',
      123,
      [],
      {},
      { postIds: [] },
      { postIds: 'no-arreglo' },
      { postIds: ['no-es-uuid'] },
      { postIds: [VALID_ID_1], extra: true },
      { postIds: tooMany },
    ]) {
      expect(parseWsDto(PostWatchDto, invalid)).toBeNull();
    }
  });
});

describe('ConversationJoinDto (parseWsDto)', () => {
  it('acepta un conversationId UUID válido y rechaza payloads inválidos', () => {
    expect(
      parseWsDto(ConversationJoinDto, { conversationId: VALID_ID_1 }),
    ).toEqual({ conversationId: VALID_ID_1 });

    for (const invalid of [
      null,
      undefined,
      {},
      { conversationId: 'no-es-uuid' },
      { conversationId: VALID_ID_1, extra: true },
    ]) {
      expect(parseWsDto(ConversationJoinDto, invalid)).toBeNull();
    }
  });
});

describe('RealtimeGateway (likes en vivo)', () => {
  function createGateway() {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    const conversations = {
      isParticipant: jest.fn(),
      findOneForUser: jest.fn(),
      getOtherLastReadAt: jest.fn(),
      filterContacts: jest.fn(),
    };
    const follows = {
      findFollowerIds: jest.fn().mockResolvedValue([]),
    };
    const gateway = new RealtimeGateway(
      {} as never,
      { corsOrigin: 'http://localhost:3001' } as never,
      conversations as never,
      follows as never,
    );
    gateway.server = { to } as never;
    return { gateway, to, emit, conversations, follows };
  }

  it('post:watch mete el socket en las salas post:{id}', async () => {
    const { gateway } = createGateway();
    const join = jest.fn().mockResolvedValue(undefined);
    await gateway.handlePostWatch({ join, rooms: new Set() } as never, {
      postIds: [VALID_ID_1, VALID_ID_2],
    });
    expect(join).toHaveBeenCalledWith([
      postRoom(VALID_ID_1),
      postRoom(VALID_ID_2),
    ]);
  });

  it('post:watch ignora un payload inválido sin unir a ninguna sala', async () => {
    const { gateway } = createGateway();
    const join = jest.fn();
    await gateway.handlePostWatch({ join, rooms: new Set() } as never, {
      postIds: ['no-es-uuid'],
    });
    expect(join).not.toHaveBeenCalled();
  });

  it('post:watch no repite salas en las que el socket ya está', async () => {
    const { gateway } = createGateway();
    const join = jest.fn().mockResolvedValue(undefined);
    const rooms = new Set(['socket-id', postRoom(VALID_ID_1)]);
    await gateway.handlePostWatch({ join, rooms } as never, {
      postIds: [VALID_ID_1, VALID_ID_2, VALID_ID_2],
    });
    expect(join).toHaveBeenCalledWith([postRoom(VALID_ID_2)]);
  });

  it('post:watch no pasa del tope de salas por socket', async () => {
    const { gateway } = createGateway();
    const join = jest.fn().mockResolvedValue(undefined);
    // Ya mira el tope menos una: solo entra a una sala más
    const rooms = new Set<string>(['socket-id', 'user:u1']);
    for (let i = 0; i < MAX_WATCHED_POSTS_PER_SOCKET - 1; i++) {
      rooms.add(postRoom(`ya-${i}`));
    }
    await gateway.handlePostWatch({ join, rooms, id: 's1' } as never, {
      postIds: [VALID_ID_1, VALID_ID_2],
    });
    expect(join).toHaveBeenCalledWith([postRoom(VALID_ID_1)]);

    // Lleno: no entra a ninguna
    join.mockClear();
    rooms.add(postRoom(VALID_ID_1));
    await gateway.handlePostWatch({ join, rooms, id: 's1' } as never, {
      postIds: [VALID_ID_2],
    });
    expect(join).not.toHaveBeenCalled();
  });

  it('post:unwatch saca el socket de cada sala post:{id}', async () => {
    const { gateway } = createGateway();
    const leave = jest.fn().mockResolvedValue(undefined);
    await gateway.handlePostUnwatch({ leave } as never, {
      postIds: [VALID_ID_1, VALID_ID_2],
    });
    expect(leave).toHaveBeenCalledTimes(2);
    expect(leave).toHaveBeenCalledWith(postRoom(VALID_ID_1));
    expect(leave).toHaveBeenCalledWith(postRoom(VALID_ID_2));
  });

  it('like.changed emite post:likes a la sala post:{postId}', () => {
    const { gateway, to, emit } = createGateway();
    gateway.handleLikeChanged({
      postId: VALID_ID_1,
      postAuthorId: 'u1',
      actorId: 'u2',
      change: 'added',
      likeCount: 7,
    });
    expect(to).toHaveBeenCalledWith(postRoom(VALID_ID_1));
    expect(emit).toHaveBeenCalledWith('post:likes', {
      postId: VALID_ID_1,
      likeCount: 7,
    });
  });

  it('comment.changed emite post:comments a la sala post:{postId}', () => {
    const { gateway, to, emit } = createGateway();
    gateway.handleCommentChanged({
      postId: VALID_ID_1,
      postAuthorId: 'u1',
      actorId: 'u2',
      commentId: 'c1',
      change: 'added',
      commentCount: 3,
    });
    expect(to).toHaveBeenCalledWith(postRoom(VALID_ID_1));
    expect(emit).toHaveBeenCalledWith('post:comments', {
      postId: VALID_ID_1,
      commentCount: 3,
    });
  });

  describe('mensajes y notificaciones en vivo (S3-05)', () => {
    it('conversation:join une a conv:{id} y responde { ok: true } si participa', async () => {
      const { gateway, conversations } = createGateway();
      conversations.isParticipant.mockResolvedValueOnce(true);
      const join = jest.fn().mockResolvedValue(undefined);

      const ack = await gateway.handleConversationJoin(
        {
          join,
          rooms: new Set(),
          data: { userId: 'u1', expiresAt: 0 },
        } as never,
        { conversationId: VALID_ID_1 },
      );

      expect(conversations.isParticipant).toHaveBeenCalledWith(
        VALID_ID_1,
        'u1',
      );
      expect(join).toHaveBeenCalledWith(conversationRoom(VALID_ID_1));
      expect(ack).toEqual({ ok: true });
    });

    it('conversation:join responde { ok: false, error: "forbidden" } sin unir si no participa o el payload es inválido (RN09)', async () => {
      const { gateway, conversations } = createGateway();
      const join = jest.fn();
      const socket = {
        join,
        rooms: new Set(),
        data: { userId: 'u3', expiresAt: 0 },
      } as never;

      expect(
        await gateway.handleConversationJoin(socket, {
          conversationId: 'no-es-uuid',
        }),
      ).toEqual({ ok: false, error: 'forbidden' });
      expect(conversations.isParticipant).not.toHaveBeenCalled();

      conversations.isParticipant.mockResolvedValueOnce(false);
      expect(
        await gateway.handleConversationJoin(socket, {
          conversationId: VALID_ID_1,
        }),
      ).toEqual({ ok: false, error: 'forbidden' });
      expect(join).not.toHaveBeenCalled();
    });

    it('conversation:join no vuelve a consultar si el socket ya está en la sala', async () => {
      const { gateway, conversations } = createGateway();
      const join = jest.fn();
      const socket = {
        join,
        rooms: new Set([conversationRoom(VALID_ID_1)]),
        data: { userId: 'u1', expiresAt: 0 },
      } as never;

      expect(
        await gateway.handleConversationJoin(socket, {
          conversationId: VALID_ID_1,
        }),
      ).toEqual({ ok: true });
      expect(conversations.isParticipant).not.toHaveBeenCalled();
      expect(join).not.toHaveBeenCalled();
    });

    it('conversation:join sale de la conversación más antigua al llegar al tope', async () => {
      const { gateway, conversations } = createGateway();
      conversations.isParticipant.mockResolvedValueOnce(true);
      const oldest = conversationRoom('c-0');
      const rooms = new Set([
        'socket-id',
        userRoom('u1'),
        postRoom(VALID_ID_2),
        ...Array.from({ length: MAX_JOINED_CONVERSATIONS_PER_SOCKET }, (_, i) =>
          conversationRoom(`c-${i}`),
        ),
      ]);
      const join = jest.fn();
      const leave = jest.fn();

      const ack = await gateway.handleConversationJoin(
        { join, leave, rooms, data: { userId: 'u1', expiresAt: 0 } } as never,
        { conversationId: VALID_ID_1 },
      );

      expect(ack).toEqual({ ok: true });
      expect(leave).toHaveBeenCalledTimes(1);
      expect(leave).toHaveBeenCalledWith(oldest);
      expect(join).toHaveBeenCalledWith(conversationRoom(VALID_ID_1));
    });

    it('message.created emite message:new a conv:{id} y conversation:updated a las salas user:{id} de ambos', async () => {
      const { gateway, to, emit, conversations } = createGateway();
      const createdAt = new Date('2026-10-30T15:00:00.000Z');
      const message = {
        id: 'm1',
        conversationId: VALID_ID_1,
        senderId: 'u1',
        content: 'Hola Beto',
        createdAt,
      };
      conversations.findOneForUser
        .mockResolvedValueOnce({
          id: VALID_ID_1,
          otherUser: {
            id: 'u2',
            username: 'beto',
            displayName: 'Beto',
            avatarPublicId: null,
          },
          lastMessage: message,
          unread: 0,
        })
        .mockResolvedValueOnce({
          id: VALID_ID_1,
          otherUser: {
            id: 'u1',
            username: 'ana',
            displayName: 'Ana',
            avatarPublicId: null,
          },
          lastMessage: message,
          unread: 1,
        });

      await gateway.handleMessageCreated({ message, recipientId: 'u2' });

      const expectedMessage = {
        id: 'm1',
        conversationId: VALID_ID_1,
        senderId: 'u1',
        content: 'Hola Beto',
        createdAt: '2026-10-30T15:00:00.000Z',
      };
      expect(to).toHaveBeenNthCalledWith(1, conversationRoom(VALID_ID_1));
      expect(emit).toHaveBeenNthCalledWith(1, 'message:new', expectedMessage);

      expect(to).toHaveBeenNthCalledWith(2, userRoom('u1'));
      expect(emit).toHaveBeenNthCalledWith(2, 'conversation:updated', {
        id: VALID_ID_1,
        otherUser: {
          id: 'u2',
          username: 'beto',
          displayName: 'Beto',
          avatarPublicId: null,
        },
        lastMessage: expectedMessage,
        unread: 0,
      });

      expect(to).toHaveBeenNthCalledWith(3, userRoom('u2'));
      expect(emit).toHaveBeenNthCalledWith(3, 'conversation:updated', {
        id: VALID_ID_1,
        otherUser: {
          id: 'u1',
          username: 'ana',
          displayName: 'Ana',
          avatarPublicId: null,
        },
        lastMessage: expectedMessage,
        unread: 1,
      });
    });

    it('notification.created emite notification:new a user:{recipientId}', () => {
      const { gateway, to, emit } = createGateway();
      const createdAt = new Date('2026-10-30T15:05:00.000Z');
      gateway.handleNotificationCreated({
        recipientId: 'u1',
        notification: {
          id: 'n1',
          type: 'like',
          actor: {
            id: 'u2',
            username: 'beto',
            displayName: null,
            avatarPublicId: null,
          },
          postId: VALID_ID_2,
          commentId: null,
          preview: null,
          read: false,
          createdAt,
        },
      });

      expect(to).toHaveBeenCalledWith(userRoom('u1'));
      expect(emit).toHaveBeenCalledWith('notification:new', {
        id: 'n1',
        type: 'like',
        actor: {
          id: 'u2',
          username: 'beto',
          displayName: null,
          avatarPublicId: null,
        },
        postId: VALID_ID_2,
        commentId: null,
        preview: null,
        read: false,
        createdAt: '2026-10-30T15:05:00.000Z',
      });
    });

    it('post.created emite feed:new a la sala user:{id} de cada seguidor (S4-11)', async () => {
      const { gateway, to, emit, follows } = createGateway();
      follows.findFollowerIds.mockResolvedValueOnce(['u2', 'u3']);

      await gateway.handlePostCreated({
        postId: VALID_ID_1,
        authorId: 'u1',
      });

      expect(follows.findFollowerIds).toHaveBeenCalledWith('u1');
      expect(to).toHaveBeenCalledTimes(1);
      expect(to).toHaveBeenCalledWith([userRoom('u2'), userRoom('u3')]);
      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('feed:new', {
        postId: VALID_ID_1,
        authorId: 'u1',
      });
    });

    it('conversation:typing reenvía al otro participante solo si el socket está en conv:{id} y conversation.read emite conversation:read (S3-06)', () => {
      const { gateway, to, emit } = createGateway();
      const socketEmit = jest.fn();
      const socketTo = jest.fn().mockReturnValue({ emit: socketEmit });

      // Si no está en la sala conv:{id}, ignora conversation:typing
      gateway.handleConversationTyping(
        {
          to: socketTo,
          rooms: new Set(),
          data: { userId: 'u1', expiresAt: 0 },
        } as never,
        { conversationId: VALID_ID_1 },
      );
      expect(socketTo).not.toHaveBeenCalled();

      // Si ya está en la sala conv:{id}, reenvía conversation:typing al resto de la sala
      gateway.handleConversationTyping(
        {
          to: socketTo,
          rooms: new Set([conversationRoom(VALID_ID_1)]),
          data: { userId: 'u1', expiresAt: 0 },
        } as never,
        { conversationId: VALID_ID_1 },
      );
      expect(socketTo).toHaveBeenCalledWith(conversationRoom(VALID_ID_1));
      expect(socketEmit).toHaveBeenCalledWith('conversation:typing', {
        conversationId: VALID_ID_1,
        userId: 'u1',
      });

      const readAt = new Date('2026-10-30T15:10:00.000Z');
      gateway.handleConversationRead({
        conversationId: VALID_ID_1,
        userId: 'u2',
        readAt,
      });
      expect(to).toHaveBeenCalledWith(conversationRoom(VALID_ID_1));
      expect(emit).toHaveBeenCalledWith('conversation:read', {
        conversationId: VALID_ID_1,
        userId: 'u2',
        readAt: '2026-10-30T15:10:00.000Z',
      });
    });

    it('presence:watch une a presence:{id}, devuelve usuarios conectados y avisa user:presence al conectar/desconectar (S3-06)', async () => {
      const { gateway, to, emit, conversations } = createGateway();
      conversations.filterContacts.mockImplementation(
        (_userId: string, ids: string[]) => Promise.resolve(ids),
      );
      const adapterRooms = new Map<string, Set<string>>([
        [userRoom(VALID_ID_1), new Set(['s-activo'])],
      ]);
      gateway.server = {
        to,
        sockets: { adapter: { rooms: adapterRooms } },
      } as never;

      const join = jest.fn().mockResolvedValue(undefined);
      const ack = await gateway.handlePresenceWatch(
        {
          join,
          rooms: new Set(),
          data: { userId: 'u9', expiresAt: 0 },
        } as never,
        { userIds: [VALID_ID_1, VALID_ID_2] },
      );

      expect(join).toHaveBeenCalledWith([
        presenceRoom(VALID_ID_1),
        presenceRoom(VALID_ID_2),
      ]);
      expect(ack).toEqual({ onlineUserIds: [VALID_ID_1] });

      // Al desconectarse la última pestaña de VALID_ID_2, emite user:presence con online: false
      gateway.handleDisconnect({
        data: { userId: VALID_ID_2, expiresAt: 0 },
      } as never);
      expect(to).toHaveBeenCalledWith(presenceRoom(VALID_ID_2));
      expect(emit).toHaveBeenCalledWith('user:presence', {
        userId: VALID_ID_2,
        online: false,
      });
    });

    it('presence:watch ignora a quien no es contacto del chat y no revela su estado (S3-06)', async () => {
      const { gateway, to, conversations } = createGateway();
      conversations.filterContacts.mockResolvedValueOnce([]);
      gateway.server = {
        to,
        sockets: {
          adapter: {
            rooms: new Map([[userRoom(VALID_ID_1), new Set(['s-activo'])]]),
          },
        },
      } as never;
      const join = jest.fn();

      const ack = await gateway.handlePresenceWatch(
        {
          join,
          rooms: new Set(),
          data: { userId: 'u9', expiresAt: 0 },
        } as never,
        { userIds: [VALID_ID_1] },
      );

      expect(conversations.filterContacts).toHaveBeenCalledWith('u9', [
        VALID_ID_1,
      ]);
      expect(join).not.toHaveBeenCalled();
      expect(ack).toEqual({ onlineUserIds: [] });
    });

    it('presence:watch no pasa de MAX_WATCHED_PRESENCE_PER_SOCKET salas', async () => {
      const { gateway, to, conversations } = createGateway();
      conversations.filterContacts.mockResolvedValueOnce([VALID_ID_1]);
      gateway.server = {
        to,
        sockets: { adapter: { rooms: new Map() } },
      } as never;
      const rooms = new Set(
        Array.from({ length: MAX_WATCHED_PRESENCE_PER_SOCKET }, (_, i) =>
          presenceRoom(`p-${i}`),
        ),
      );
      const join = jest.fn();

      await gateway.handlePresenceWatch(
        { join, rooms, data: { userId: 'u9', expiresAt: 0 } } as never,
        { userIds: [VALID_ID_1] },
      );

      expect(join).not.toHaveBeenCalled();
    });
  });
});
