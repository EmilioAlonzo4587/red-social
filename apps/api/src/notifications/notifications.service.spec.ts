import { DomainEvents } from '../events/domain-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { toPreview, NotificationsService } from './notifications.service';

// Lógica de NotificationsService con Prisma simulado. La lista, el contador y la paginación
// contra la base real están en test/notifications.e2e-spec.ts.
describe('NotificationsService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    notification: {
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const events = { emit: jest.fn() };
  let service: NotificationsService;

  const actor = {
    id: 'beto',
    username: 'beto',
    displayName: null,
    avatarPublicId: null,
  };
  const row = {
    id: 'n1',
    type: 'like',
    postId: 'p1',
    commentId: null,
    readAt: null,
    createdAt: new Date('2026-10-29T12:00:00Z'),
    comment: null,
    actor,
  };
  const notification = {
    id: 'n1',
    type: 'like',
    actor,
    postId: 'p1',
    commentId: null,
    preview: null,
    reaction: null,
    read: false,
    createdAt: row.createdAt,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotificationsService(
      prisma as unknown as PrismaService,
      events as unknown as DomainEvents,
    );
  });

  describe('notify', () => {
    it('crea la notificación y emite notification.created', async () => {
      prisma.notification.findFirst.mockResolvedValueOnce(null);
      prisma.notification.create.mockResolvedValueOnce(row);

      await expect(
        service.notify({
          type: 'like',
          recipientId: 'ana',
          actorId: 'beto',
          postId: 'p1',
        }),
      ).resolves.toEqual(notification);
      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            type: 'like',
            recipientId: 'ana',
            actorId: 'beto',
            postId: 'p1',
            commentId: null,
          },
        }),
      );
      expect(events.emit).toHaveBeenCalledWith('notification.created', {
        recipientId: 'ana',
        notification,
      });
    });

    it('nunca para uno mismo (RN08)', async () => {
      await expect(
        service.notify({ type: 'follow', recipientId: 'ana', actorId: 'ana' }),
      ).resolves.toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('message: no crea otra si ya hay una sin leer del mismo remitente', async () => {
      prisma.notification.findFirst.mockResolvedValueOnce({ id: 'n0' });

      await expect(
        service.notify({
          type: 'message',
          recipientId: 'ana',
          actorId: 'beto',
        }),
      ).resolves.toBeNull();
      expect(prisma.notification.findFirst).toHaveBeenCalledWith({
        where: {
          type: 'message',
          recipientId: 'ana',
          actorId: 'beto',
          readAt: null,
        },
        select: { id: true },
      });
      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('message: la crea si no hay una pendiente y recorta preview a ~80 caracteres', async () => {
      prisma.notification.findFirst.mockResolvedValueOnce(null);
      prisma.notification.create.mockResolvedValueOnce({
        ...row,
        type: 'message',
        postId: null,
      });

      const longText = 'a'.repeat(100);
      await expect(
        service.notify({
          type: 'message',
          recipientId: 'ana',
          actorId: 'beto',
          preview: longText,
        }),
      ).resolves.toMatchObject({
        type: 'message',
        postId: null,
        preview: `${'a'.repeat(80)}…`,
      });
      expect(events.emit).toHaveBeenCalledTimes(1);
    });

    it('preview: recorta a 80 caracteres sin partir un emoji ni dejar saltos de línea (S4-11)', () => {
      expect(toPreview(`${'a'.repeat(79)}😀😀`)).toBe(`${'a'.repeat(79)}😀…`);
      expect(toPreview('Hola\n\n  mundo ')).toBe('Hola mundo');
      expect(toPreview('   ')).toBeNull();
      expect(toPreview(null)).toBeNull();
    });

    it('like: no crea otra si la misma persona ya había dado like a esa publicación (S4-11)', async () => {
      prisma.notification.findFirst.mockResolvedValueOnce({ id: 'n-previa' });

      await expect(
        service.notify({
          type: 'like',
          recipientId: 'ana',
          actorId: 'beto',
          postId: 'p1',
        }),
      ).resolves.toBeNull();
      expect(prisma.notification.findFirst).toHaveBeenCalledWith({
        where: {
          type: 'like',
          recipientId: 'ana',
          actorId: 'beto',
          postId: 'p1',
        },
        select: { id: true },
      });
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('comment: silencia a partir del comentario 10 de la misma persona en la misma publicación (S4-11)', async () => {
      prisma.notification.count.mockResolvedValueOnce(10);

      await expect(
        service.notify({
          type: 'comment',
          recipientId: 'ana',
          actorId: 'beto',
          postId: 'p1',
          commentId: 'c11',
        }),
      ).resolves.toBeNull();
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: {
          type: 'comment',
          recipientId: 'ana',
          actorId: 'beto',
          postId: 'p1',
        },
      });
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });

  describe('markRead', () => {
    it('ids: solo esas, del usuario de la sesión y sin leer', async () => {
      await service.markRead('ana', { ids: ['n1', 'n2'] });
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { recipientId: 'ana', readAt: null, id: { in: ['n1', 'n2'] } },
        data: { readAt: expect.any(Date) as Date },
      });
    });

    it('all: todas las sin leer del usuario', async () => {
      await service.markRead('ana', { all: true });
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { recipientId: 'ana', readAt: null },
        data: { readAt: expect.any(Date) as Date },
      });
    });
  });

  describe('list', () => {
    it('400 con un cursor que la api no generó, sin consultar', async () => {
      await expect(service.list('ana', 'basura')).rejects.toMatchObject({
        status: 400,
      });
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });
});
