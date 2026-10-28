import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

// Lógica de UsersService con Prisma simulado. El flujo contra la base real está en
// test/users.e2e-spec.ts.
describe('UsersService', () => {
  const prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
  let service: UsersService;

  const row = (followers: { followerId: string }[]) => ({
    id: 'u1',
    username: 'ana_lopez',
    displayName: 'Ana',
    avatarPublicId: null,
    bio: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    _count: { posts: 3, followers: 2, following: 1 },
    followers,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService(prisma as unknown as PrismaService);
  });

  describe('profile', () => {
    it('404 si el usuario no existe', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.profile('nadie', 'u2')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('arma el Profile con los contadores y sin campos de más', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(row([{ followerId: 'u2' }]));
      await expect(service.profile('ana_lopez', 'u2')).resolves.toEqual({
        id: 'u1',
        username: 'ana_lopez',
        displayName: 'Ana',
        avatarPublicId: null,
        bio: null,
        createdAt: new Date('2026-10-01T00:00:00Z'),
        postCount: 3,
        followerCount: 2,
        followingCount: 1,
        isFollowing: true,
      });
    });

    it('isFollowing es false si no lo sigo', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(row([]));
      const profile = await service.profile('ana_lopez', 'u2');
      expect(profile.isFollowing).toBe(false);
    });

    it('isFollowing es false en el perfil propio', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(row([{ followerId: 'u1' }]));
      const profile = await service.profile('ana_lopez', 'u1');
      expect(profile.isFollowing).toBe(false);
    });
  });

  describe('updateMe', () => {
    it('solo cambia los campos que llegan y actualiza al usuario de la sesión', async () => {
      prisma.user.update.mockResolvedValueOnce({});
      await service.updateMe('u1', { bio: null });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: { displayName: undefined, bio: null },
        }),
      );
    });
  });
});
