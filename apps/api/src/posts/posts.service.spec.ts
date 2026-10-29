import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { CloudinaryService } from '../media/cloudinary.service';
import { PrismaService } from '../prisma/prisma.service';
import { PostsService } from './posts.service';

// Lógica de PostsService con Prisma y CloudinaryService simulados. El flujo contra la
// base real está en test/posts.e2e-spec.ts.
describe('PostsService', () => {
  const prisma = {
    post: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  };
  const cloudinary = {
    belongsToUser: jest.fn(),
    deleteByPublicId: jest.fn(),
  };
  let service: PostsService;

  const row = {
    id: 'p1',
    content: 'Hola',
    likeCount: 3,
    commentCount: 1,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    author: {
      id: 'u1',
      username: 'ana_lopez',
      displayName: null,
      avatarPublicId: null,
    },
    media: [{ publicId: 'users/u1/a', width: 1200, height: 800 }],
    likes: [] as { userId: string }[],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    cloudinary.belongsToUser.mockImplementation(
      (publicId: string, id: string) => publicId.startsWith(`users/${id}/`),
    );
    cloudinary.deleteByPublicId.mockResolvedValue(undefined);
    service = new PostsService(
      prisma as unknown as PrismaService,
      cloudinary as unknown as CloudinaryService,
    );
  });

  describe('create', () => {
    it('400 si no trae texto ni imágenes, sin tocar la base', async () => {
      await expect(
        service.create('u1', { content: null, media: [] }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.post.create).not.toHaveBeenCalled();
    });

    it('400 si una imagen no está en la carpeta del autor', async () => {
      await expect(
        service.create('u1', {
          media: [{ publicId: 'users/u2/b', width: 1, height: 1 }],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.post.create).not.toHaveBeenCalled();
    });

    it('guarda las imágenes con su posición y arma el Post', async () => {
      prisma.post.create.mockResolvedValueOnce(row);

      await expect(
        service.create('u1', {
          media: [
            { publicId: 'users/u1/a', width: 1200, height: 800 },
            { publicId: 'users/u1/b', width: 10, height: 20 },
          ],
        }),
      ).resolves.toEqual({
        id: 'p1',
        author: row.author,
        content: 'Hola',
        media: [
          {
            publicId: 'users/u1/a',
            mediaType: 'image',
            width: 1200,
            height: 800,
          },
        ],
        likeCount: 3,
        commentCount: 1,
        likedByMe: false,
        createdAt: row.createdAt,
      });

      const [{ data }] = prisma.post.create.mock.calls[0] as [
        { data: { media: { create: { position: number }[] } } },
      ];
      expect(data.media.create.map((m) => m.position)).toEqual([0, 1]);
    });
  });

  describe('findOne', () => {
    it('404 si no existe o fue eliminada', async () => {
      prisma.post.findFirst.mockResolvedValueOnce(null);
      await expect(service.findOne('p1', 'u2')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('likedByMe es true si el usuario con sesión tiene su fila en likes', async () => {
      prisma.post.findFirst.mockResolvedValueOnce({
        ...row,
        likes: [{ userId: 'u2' }],
      });
      await expect(service.findOne('p1', 'u2')).resolves.toMatchObject({
        likedByMe: true,
      });
    });
  });

  describe('remove', () => {
    it('404 si no existe', async () => {
      prisma.post.findFirst.mockResolvedValueOnce(null);
      await expect(service.remove('p1', 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('403 si es de otro usuario, sin marcarla ni borrar imágenes', async () => {
      prisma.post.findFirst.mockResolvedValueOnce({
        authorId: 'u1',
        media: [{ publicId: 'users/u1/a' }],
      });
      await expect(service.remove('p1', 'u2')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.post.update).not.toHaveBeenCalled();
      expect(cloudinary.deleteByPublicId).not.toHaveBeenCalled();
    });

    it('marca deletedAt y, si Cloudinary falla, igual termina', async () => {
      prisma.post.findFirst.mockResolvedValueOnce({
        authorId: 'u1',
        media: [{ publicId: 'users/u1/a' }, { publicId: 'users/u1/b' }],
      });
      cloudinary.deleteByPublicId.mockRejectedValueOnce(new Error('caído'));

      await expect(service.remove('p1', 'u1')).resolves.toBeUndefined();
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { deletedAt: expect.any(Date) as Date },
      });
      expect(cloudinary.deleteByPublicId).toHaveBeenCalledTimes(2);
    });
  });
});
