import { NotFoundException } from '@nestjs/common';
import { DomainEvents } from '../events/domain-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { LikesService } from './likes.service';

// Lógica de LikesService con Prisma simulado: la transacción recibe el mismo objeto como
// cliente. El flujo contra la base real, con likes simultáneos, está en test/likes.e2e-spec.ts.
describe('LikesService', () => {
  const tx = {
    post: { findFirst: jest.fn(), update: jest.fn() },
    postLike: {
      createMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      groupBy: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn(),
    post: { findFirst: jest.fn() },
    postLike: { findMany: jest.fn() },
  };
  const events = { emit: jest.fn() };
  let service: LikesService;

  const counts = (reaction: string, count: number) => [
    { postId: 'p1', reaction, _count: { _all: count } },
  ];

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(
      (run: (client: typeof tx) => Promise<unknown>) => run(tx),
    );
    tx.post.findFirst.mockResolvedValue({ authorId: 'ana', likeCount: 4 });
    tx.postLike.groupBy.mockResolvedValue([]);
    service = new LikesService(
      prisma as unknown as PrismaService,
      events as unknown as DomainEvents,
    );
  });

  it('reacción nueva: incrementa, emite like.changed y devuelve el estado', async () => {
    tx.postLike.createMany.mockResolvedValueOnce({ count: 1 });
    tx.post.update.mockResolvedValueOnce({ likeCount: 5 });
    tx.postLike.groupBy.mockResolvedValueOnce(counts('love', 5));

    await expect(service.react('p1', 'beto', 'love')).resolves.toEqual({
      likeCount: 5,
      likedByMe: true,
      myReaction: 'love',
      topReactions: ['love'],
    });
    expect(tx.postLike.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'beto', postId: 'p1', reaction: 'love' }],
      skipDuplicates: true,
    });
    expect(tx.post.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { likeCount: { increment: 1 } },
      select: { likeCount: true },
    });
    expect(events.emit).toHaveBeenCalledWith('like.changed', {
      postId: 'p1',
      postAuthorId: 'ana',
      actorId: 'beto',
      change: 'added',
      likeCount: 5,
      topReactions: ['love'],
      reaction: 'love',
    });
  });

  it('sin reacción cuenta como Me gusta', async () => {
    tx.postLike.createMany.mockResolvedValueOnce({ count: 1 });
    tx.post.update.mockResolvedValueOnce({ likeCount: 5 });

    await expect(service.react('p1', 'beto')).resolves.toMatchObject({
      myReaction: 'like',
    });
  });

  it('otra reacción: la reemplaza sin tocar el total y emite changed', async () => {
    tx.postLike.createMany.mockResolvedValueOnce({ count: 0 });
    tx.postLike.updateMany.mockResolvedValueOnce({ count: 1 });
    tx.postLike.groupBy.mockResolvedValueOnce(counts('sad', 4));

    await expect(service.react('p1', 'beto', 'sad')).resolves.toEqual({
      likeCount: 4,
      likedByMe: true,
      myReaction: 'sad',
      topReactions: ['sad'],
    });
    expect(tx.post.update).not.toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(
      'like.changed',
      expect.objectContaining({ change: 'changed', likeCount: 4 }),
    );
  });

  it('la misma reacción repetida: no toca el total ni emite (RN05)', async () => {
    tx.postLike.createMany.mockResolvedValueOnce({ count: 0 });
    tx.postLike.updateMany.mockResolvedValueOnce({ count: 0 });
    tx.postLike.groupBy.mockResolvedValueOnce(counts('love', 4));

    await expect(service.react('p1', 'beto', 'love')).resolves.toEqual({
      likeCount: 4,
      likedByMe: true,
      myReaction: 'love',
      topReactions: ['love'],
    });
    expect(tx.post.update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('quitar: decrementa y emite con change removed', async () => {
    tx.postLike.deleteMany.mockResolvedValueOnce({ count: 1 });
    tx.post.update.mockResolvedValueOnce({ likeCount: 3 });

    await expect(service.unreact('p1', 'beto')).resolves.toEqual({
      likeCount: 3,
      likedByMe: false,
      myReaction: null,
      topReactions: [],
    });
    expect(tx.post.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { likeCount: { decrement: 1 } } }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'like.changed',
      expect.objectContaining({ change: 'removed', likeCount: 3 }),
    );
  });

  it('quitar sin haber reaccionado: no toca el total ni emite', async () => {
    tx.postLike.deleteMany.mockResolvedValueOnce({ count: 0 });

    await service.unreact('p1', 'beto');

    expect(tx.post.update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('404 si la publicación no existe o fue eliminada, sin escribir ni emitir', async () => {
    tx.post.findFirst.mockResolvedValueOnce(null);

    await expect(service.react('p1', 'beto')).rejects.toThrow(
      NotFoundException,
    );
    expect(tx.postLike.createMany).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  describe('recent (S4-16)', () => {
    it('devuelve las 5 más recientes con el total de like_count', async () => {
      prisma.post.findFirst.mockResolvedValueOnce({ likeCount: 7 });
      const createdAt = new Date('2026-10-31T12:00:00Z');
      const user = {
        id: 'beto',
        username: 'beto',
        displayName: null,
        avatarPublicId: null,
      };
      prisma.postLike.findMany.mockResolvedValueOnce([
        { reaction: 'love', createdAt, user },
      ]);

      await expect(service.recent('p1')).resolves.toEqual({
        total: 7,
        items: [{ user, reaction: 'love', createdAt }],
      });
      expect(prisma.post.findFirst).toHaveBeenCalledWith({
        where: { id: 'p1', deletedAt: null },
        select: { likeCount: true },
      });
      expect(prisma.postLike.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { postId: 'p1' },
          orderBy: [{ createdAt: 'desc' }, { userId: 'desc' }],
          take: 5,
        }),
      );
    });

    it('404 si la publicación no existe o fue eliminada', async () => {
      prisma.post.findFirst.mockResolvedValueOnce(null);
      await expect(service.recent('p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.postLike.findMany).not.toHaveBeenCalled();
    });
  });
});
