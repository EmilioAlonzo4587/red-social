import {
  MAX_WATCH_POST_IDS,
  PostWatchDto,
  parseWsDto,
} from './dto/post-watch.dto';
import { postRoom } from './realtime.events';
import {
  MAX_WATCHED_POSTS_PER_SOCKET,
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

describe('RealtimeGateway (likes en vivo)', () => {
  function createGateway() {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    const gateway = new RealtimeGateway(
      {} as never,
      { corsOrigin: 'http://localhost:3001' } as never,
    );
    gateway.server = { to } as never;
    return { gateway, to, emit };
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
});
