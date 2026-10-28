import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { CloudinaryService } from '../media/cloudinary.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

// Lógica de UsersService con Prisma y CloudinaryService simulados. El flujo contra la
// base real está en test/users.e2e-spec.ts.
describe('UsersService', () => {
  const prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
  const cloudinary = {
    belongsToUser: jest.fn().mockReturnValue(true),
    deleteByPublicId: jest.fn().mockResolvedValue(undefined),
  };
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
    cloudinary.belongsToUser.mockReturnValue(true);
    cloudinary.deleteByPublicId.mockResolvedValue(undefined);
    service = new UsersService(
      prisma as unknown as PrismaService,
      cloudinary as unknown as CloudinaryService,
    );
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
          data: {
            displayName: undefined,
            bio: null,
            avatarPublicId: undefined,
          },
        }),
      );
      // avatarPublicId no llegó: no se consulta el anterior ni se borra nada
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(cloudinary.deleteByPublicId).not.toHaveBeenCalled();
    });

    it('400 si el avatarPublicId no es del usuario (RN04)', async () => {
      cloudinary.belongsToUser.mockReturnValueOnce(false);
      await expect(
        service.updateMe('u1', { avatarPublicId: 'users/otro/foto' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('400 si avatarPublicId es una cadena vacía (no se salta la validación)', async () => {
      // '' es falsy en JS: valida con != null, no con el valor en sí
      cloudinary.belongsToUser.mockReturnValueOnce(false);
      await expect(
        service.updateMe('u1', { avatarPublicId: '' }),
      ).rejects.toThrow(BadRequestException);
      expect(cloudinary.belongsToUser).toHaveBeenCalledWith('', 'u1');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('borra el avatar anterior en Cloudinary cuando cambia', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        avatarPublicId: 'users/u1/viejo',
      });
      prisma.user.update.mockResolvedValueOnce({});
      await service.updateMe('u1', { avatarPublicId: 'users/u1/nuevo' });
      expect(cloudinary.deleteByPublicId).toHaveBeenCalledWith(
        'users/u1/viejo',
      );
    });

    it('no borra nada si no había avatar anterior', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ avatarPublicId: null });
      prisma.user.update.mockResolvedValueOnce({});
      await service.updateMe('u1', { avatarPublicId: 'users/u1/nuevo' });
      expect(cloudinary.deleteByPublicId).not.toHaveBeenCalled();
    });

    it('no borra nada si el avatar no cambia', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        avatarPublicId: 'users/u1/igual',
      });
      prisma.user.update.mockResolvedValueOnce({});
      await service.updateMe('u1', { avatarPublicId: 'users/u1/igual' });
      expect(cloudinary.deleteByPublicId).not.toHaveBeenCalled();
    });

    it('un error al borrar el avatar anterior no rompe la respuesta', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        avatarPublicId: 'users/u1/viejo',
      });
      prisma.user.update.mockResolvedValueOnce({ id: 'u1' });
      cloudinary.deleteByPublicId.mockRejectedValueOnce(new Error('caído'));
      await expect(
        service.updateMe('u1', { avatarPublicId: 'users/u1/nuevo' }),
      ).resolves.toEqual({ id: 'u1' });
    });
  });
});
