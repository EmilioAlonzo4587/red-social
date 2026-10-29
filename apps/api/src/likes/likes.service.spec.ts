import { NotFoundException } from '@nestjs/common';
import { DomainEvents } from '../events/domain-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { LikesService } from './likes.service';

// Lógica de LikesService con Prisma simulado: la transacción recibe el mismo objeto como
// cliente. El flujo contra la base real, con likes simultáneos, está en test/likes.e2e-spec.ts.
describe('LikesService', () => {
  const tx = {
    post: { findFirst: jest.fn(), update: jest.fn() },
    postLike: { createMany: jest.fn(), deleteMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((run: (client: typeof tx) => Promise<unknown>) =>
      run(tx),
    ),
  };
  const events = { emit: jest.fn() };
  let service: LikesService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx.post.findFirst.mockResolvedValue({ authorId: 'ana', likeCount: 4 });
    service = new LikesService(
      prisma as unknown as PrismaService,
      events as unknown as DomainEvents,
    );
  });

  it('like nuevo: incrementa, emite like.changed y devuelve el contador', async () => {
    tx.postLike.createMany.mockResolvedValueOnce({ count: 1 });
    tx.post.update.mockResolvedValueOnce({ likeCount: 5 });

    await expect(service.like('p1', 'beto')).resolves.toEqual({
      likeCount: 5,
      likedByMe: true,
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
    });
  });

  it('like repetido: no toca el contador ni emite (RN05)', async () => {
    tx.postLike.createMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.like('p1', 'beto')).resolves.toEqual({
      likeCount: 4,
      likedByMe: true,
    });
    expect(tx.post.update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('unlike: decrementa y emite con change removed', async () => {
    tx.postLike.deleteMany.mockResolvedValueOnce({ count: 1 });
    tx.post.update.mockResolvedValueOnce({ likeCount: 3 });

    await expect(service.unlike('p1', 'beto')).resolves.toEqual({
      likeCount: 3,
      likedByMe: false,
    });
    expect(tx.post.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { likeCount: { decrement: 1 } } }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'like.changed',
      expect.objectContaining({ change: 'removed', likeCount: 3 }),
    );
  });

  it('404 si la publicación no existe o fue eliminada, sin escribir ni emitir', async () => {
    tx.post.findFirst.mockResolvedValueOnce(null);

    await expect(service.like('p1', 'beto')).rejects.toThrow(NotFoundException);
    expect(tx.postLike.createMany).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });
});
