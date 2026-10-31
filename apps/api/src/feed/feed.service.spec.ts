import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeedService } from './feed.service';

// Lógica de FeedService con Prisma simulado. El flujo contra la base real, incluida la
// paginación y el filtro de Siguiendo, está en test/feed.e2e-spec.ts.
describe('FeedService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    user: { findUnique: jest.fn() },
    post: { findMany: jest.fn() },
    postLike: { groupBy: jest.fn().mockResolvedValue([]) },
  };
  let service: FeedService;

  const key = (id: string, second: number) => ({
    id,
    createdAt: `2026-10-28T12:00:${String(second).padStart(2, '0')}.000000Z`,
  });
  const row = (id: string) => ({
    id,
    content: id,
    likeCount: 0,
    commentCount: 0,
    createdAt: new Date('2026-10-28T12:00:00Z'),
    author: {
      id: 'u1',
      username: 'ana_lopez',
      displayName: null,
      avatarPublicId: null,
    },
    media: [],
    likes: [],
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FeedService(prisma as unknown as PrismaService);
  });

  it('respeta el orden del cursor aunque findMany devuelva otro', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([key('p2', 2), key('p1', 1)]);
    prisma.post.findMany.mockResolvedValueOnce([row('p1'), row('p2')]);

    const page = await service.explore('u1');

    expect(page.items.map((p) => p.id)).toEqual(['p2', 'p1']);
    expect(page.nextCursor).toBeNull();
  });

  it('omite una publicación que desapareció entre las dos consultas', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([key('p2', 2), key('p1', 1)]);
    prisma.post.findMany.mockResolvedValueOnce([row('p1')]);

    const page = await service.explore('u1');

    expect(page.items.map((p) => p.id)).toEqual(['p1']);
  });

  it('con 21 filas devuelve 20 y el cursor de la última, sin pedir la de más', async () => {
    const keys = Array.from({ length: 21 }, (_, i) => key(`p${i}`, 59 - i));
    prisma.$queryRaw.mockResolvedValueOnce(keys);
    prisma.post.findMany.mockResolvedValueOnce(
      keys.slice(0, 20).map((k) => row(k.id)),
    );

    const page = await service.explore('u1');

    expect(page.items).toHaveLength(20);
    expect(page.nextCursor).toEqual(expect.any(String));
    const [args] = prisma.post.findMany.mock.calls[0] as [
      { where: { id: { in: string[] } } },
    ];
    expect(args.where.id.in).toHaveLength(20);
  });

  it('400 con un cursor inválido, sin consultar la base', async () => {
    await expect(service.explore('u1', 'inventado')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('byUser: 404 si el usuario no existe', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.byUser('nadie', 'u1')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
