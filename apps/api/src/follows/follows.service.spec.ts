import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DomainEvents } from '../events/domain-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { FollowsService } from './follows.service';

// Lógica de FollowsService con Prisma simulado. El flujo contra la base real, incluida la
// paginación, está en test/follows.e2e-spec.ts.
describe('FollowsService', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    follow: { createMany: jest.fn(), deleteMany: jest.fn(), count: jest.fn() },
  };
  const events = { emit: jest.fn() };
  let service: FollowsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FollowsService(
      prisma as unknown as PrismaService,
      events as unknown as DomainEvents,
    );
    prisma.user.findUnique.mockResolvedValue({ id: 'beto' });
    prisma.follow.count.mockResolvedValue(1);
  });

  describe('follow', () => {
    it('crea la fila, emite follow.created y devuelve el contador', async () => {
      prisma.follow.createMany.mockResolvedValueOnce({ count: 1 });

      await expect(service.follow('beto', 'ana')).resolves.toEqual({
        isFollowing: true,
        followerCount: 1,
      });
      expect(events.emit).toHaveBeenCalledWith('follow.created', {
        followerId: 'ana',
        followingId: 'beto',
      });
    });

    it('si ya lo seguía no emite otra vez (RN06)', async () => {
      prisma.follow.createMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.follow('beto', 'ana')).resolves.toEqual({
        isFollowing: true,
        followerCount: 1,
      });
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('400 al seguirse a sí mismo, sin tocar la base ni emitir (RN06)', async () => {
      await expect(service.follow('beto', 'beto')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.follow.createMany).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('404 si el usuario no existe', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.follow('nadie', 'ana')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('unfollow', () => {
    it('borra solo la fila del usuario de la sesión y no emite nada', async () => {
      prisma.follow.deleteMany.mockResolvedValueOnce({ count: 1 });
      prisma.follow.count.mockResolvedValueOnce(0);

      await expect(service.unfollow('beto', 'ana')).resolves.toEqual({
        isFollowing: false,
        followerCount: 0,
      });
      expect(prisma.follow.deleteMany).toHaveBeenCalledWith({
        where: { followerId: 'ana', followingId: 'beto' },
      });
      expect(events.emit).not.toHaveBeenCalled();
    });
  });
});
