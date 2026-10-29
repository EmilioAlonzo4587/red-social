import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DomainEvents } from '../events/domain-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommentsService } from './comments.service';

// Lógica de CommentsService con Prisma simulado: la transacción recibe el mismo objeto como
// cliente. El flujo contra la base real, con la paginación, está en test/comments.e2e-spec.ts.
describe('CommentsService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
    post: { findFirst: jest.fn(), update: jest.fn() },
    comment: { create: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
  };
  const events = { emit: jest.fn() };
  let service: CommentsService;

  const comment = {
    id: 'c1',
    postId: 'p1',
    content: 'Hola',
    createdAt: new Date('2026-10-28T12:00:00Z'),
    author: {
      id: 'beto',
      username: 'beto',
      displayName: null,
      avatarPublicId: null,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (run: (client: typeof prisma) => Promise<unknown>) => run(prisma),
    );
    prisma.post.findFirst.mockResolvedValue({ authorId: 'ana' });
    service = new CommentsService(
      prisma as unknown as PrismaService,
      events as unknown as DomainEvents,
    );
  });

  describe('create', () => {
    it('crea, incrementa el contador y emite comment.changed', async () => {
      prisma.comment.create.mockResolvedValueOnce(comment);
      prisma.post.update.mockResolvedValueOnce({ commentCount: 3 });

      await expect(
        service.create('p1', 'beto', { content: 'Hola' }),
      ).resolves.toEqual(comment);
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { commentCount: { increment: 1 } },
        select: { commentCount: true },
      });
      expect(events.emit).toHaveBeenCalledWith('comment.changed', {
        postId: 'p1',
        postAuthorId: 'ana',
        actorId: 'beto',
        commentId: 'c1',
        change: 'added',
        commentCount: 3,
      });
    });

    it('404 si la publicación no existe, sin crear ni emitir', async () => {
      prisma.post.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.create('p1', 'beto', { content: 'Hola' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.comment.create).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    const found = {
      authorId: 'beto',
      postId: 'p1',
      post: { authorId: 'ana' },
    };

    it('403 si es de otro usuario, sin marcarlo ni emitir', async () => {
      prisma.comment.findFirst.mockResolvedValueOnce(found);
      await expect(service.remove('c1', 'ana')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.comment.updateMany).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('404 si no existe', async () => {
      prisma.comment.findFirst.mockResolvedValueOnce(null);
      await expect(service.remove('c1', 'beto')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('marca, decrementa y emite con change removed', async () => {
      prisma.comment.findFirst.mockResolvedValueOnce(found);
      prisma.comment.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.post.update.mockResolvedValueOnce({ commentCount: 2 });

      await service.remove('c1', 'beto');

      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { commentCount: { decrement: 1 } } }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        'comment.changed',
        expect.objectContaining({ change: 'removed', commentCount: 2 }),
      );
    });

    it('si otro DELETE ya lo marcó, no resta ni emite otra vez', async () => {
      prisma.comment.findFirst.mockResolvedValueOnce(found);
      prisma.comment.updateMany.mockResolvedValueOnce({ count: 0 });

      await service.remove('c1', 'beto');

      expect(prisma.post.update).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('400 con un cursor inválido, sin consultar la base', async () => {
      await expect(service.list('p1', 'inventado')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('arma Comment con su autor y convierte la fecha', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'c1',
          postId: 'p1',
          content: 'Hola',
          createdAt: '2026-10-28T12:00:00.123456Z',
          authorId: 'beto',
          username: 'beto',
          displayName: null,
          avatarPublicId: null,
        },
      ]);

      const page = await service.list('p1');

      expect(page).toEqual({
        items: [
          {
            id: 'c1',
            postId: 'p1',
            content: 'Hola',
            createdAt: new Date('2026-10-28T12:00:00.123Z'),
            author: {
              id: 'beto',
              username: 'beto',
              displayName: null,
              avatarPublicId: null,
            },
          },
        ],
        nextCursor: null,
      });
    });
  });
});
