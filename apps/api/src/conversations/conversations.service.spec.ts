import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DomainEvents } from '../events/domain-events.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConversationsService,
  orderParticipants,
} from './conversations.service';

// Lógica de ConversationsService con Prisma simulado: la transacción recibe el mismo objeto
// como cliente. Las consultas reales (bandeja, no leídos, paginación) están en
// test/conversations.e2e-spec.ts.
describe('ConversationsService', () => {
  const ANA = '019a0000-0000-7000-8000-00000000000a';
  const BETO = '019a0000-0000-7000-8000-00000000000b';
  const CARLA = '019a0000-0000-7000-8000-00000000000c';

  const prisma = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
    user: { findUnique: jest.fn() },
    conversation: {
      createMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    message: { create: jest.fn() },
  };
  const events = { emit: jest.fn() };
  let service: ConversationsService;

  const row = {
    id: 'c1',
    otherId: BETO,
    otherUsername: 'beto',
    otherDisplayName: null,
    otherAvatarPublicId: null,
    messageId: null,
    senderId: null,
    content: null,
    messageCreatedAt: null,
    unread: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (run: (client: typeof prisma) => Promise<unknown>) => run(prisma),
    );
    service = new ConversationsService(
      prisma as unknown as PrismaService,
      events as unknown as DomainEvents,
    );
  });

  describe('orderParticipants', () => {
    it('deja primero el id menor, en cualquier orden de llegada (CHECK a < b)', () => {
      expect(orderParticipants(BETO, ANA)).toEqual([ANA, BETO]);
      expect(orderParticipants(ANA, BETO)).toEqual([ANA, BETO]);
    });
  });

  describe('open', () => {
    it('404 si el usuario no existe', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.open(ANA, 'nadie')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('400 consigo mismo, sin crear nada', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: ANA });
      await expect(service.open(ANA, 'ana_lopez')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.conversation.createMany).not.toHaveBeenCalled();
    });

    it('crea la pareja ordenada sin duplicar y avisa si es nueva', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: ANA });
      prisma.conversation.findUniqueOrThrow.mockResolvedValue({ id: 'c1' });
      prisma.$queryRaw.mockResolvedValue([row]);

      prisma.conversation.createMany.mockResolvedValueOnce({ count: 1 });
      const nueva = await service.open(BETO, 'ana_lopez');
      expect(prisma.conversation.createMany).toHaveBeenCalledWith({
        data: [{ userAId: ANA, userBId: BETO }],
        skipDuplicates: true,
      });
      expect(nueva.created).toBe(true);
      expect(nueva.conversation).toEqual({
        id: 'c1',
        otherUser: {
          id: BETO,
          username: 'beto',
          displayName: null,
          avatarPublicId: null,
        },
        lastMessage: null,
        unread: 0,
      });

      prisma.conversation.createMany.mockResolvedValueOnce({ count: 0 });
      expect((await service.open(BETO, 'ana_lopez')).created).toBe(false);
    });
  });

  describe('send', () => {
    const message = {
      id: 'm1',
      conversationId: 'c1',
      senderId: ANA,
      content: 'Hola',
      createdAt: new Date('2026-10-30T12:00:00Z'),
    };

    it('crea el mensaje y emite message.created para el otro participante', async () => {
      prisma.conversation.findUnique.mockResolvedValueOnce({
        userAId: ANA,
        userBId: BETO,
      });
      prisma.message.create.mockResolvedValueOnce(message);

      await expect(
        service.send('c1', ANA, { content: 'Hola' }),
      ).resolves.toEqual(message);
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(events.emit).toHaveBeenCalledWith('message.created', {
        message,
        recipientId: BETO,
      });
    });

    it('403 si no participa (RN09) y 404 si no existe, sin crear ni emitir', async () => {
      prisma.conversation.findUnique.mockResolvedValueOnce({
        userAId: ANA,
        userBId: BETO,
      });
      await expect(
        service.send('c1', CARLA, { content: 'Hola' }),
      ).rejects.toThrow(ForbiddenException);

      prisma.conversation.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.send('c1', ANA, { content: 'Hola' }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.message.create).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  describe('inbox', () => {
    it('arma lastMessage solo cuando la conversación tiene mensajes', async () => {
      const createdAt = new Date('2026-10-30T12:00:00Z');
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          ...row,
          messageId: 'm1',
          senderId: BETO,
          content: 'Hola',
          messageCreatedAt: createdAt,
          unread: 1,
        },
      ]);
      const [conversation] = await service.inbox(ANA);
      expect(conversation.lastMessage).toEqual({
        id: 'm1',
        conversationId: 'c1',
        senderId: BETO,
        content: 'Hola',
        createdAt,
      });
      expect(conversation.unread).toBe(1);
    });
  });

  describe('filterContacts (S3-06)', () => {
    it('deja solo a quienes tienen conversación con el usuario, en cualquier lado de la pareja', async () => {
      prisma.conversation.findMany.mockResolvedValueOnce([
        { userAId: ANA, userBId: BETO },
      ]);
      await expect(service.filterContacts(BETO, [ANA, CARLA])).resolves.toEqual(
        [ANA],
      );

      prisma.conversation.findMany.mockResolvedValueOnce([
        { userAId: ANA, userBId: CARLA },
      ]);
      await expect(service.filterContacts(ANA, [CARLA])).resolves.toEqual([
        CARLA,
      ]);
    });

    it('sin ids no consulta la base', async () => {
      await expect(service.filterContacts(ANA, [])).resolves.toEqual([]);
      expect(prisma.conversation.findMany).not.toHaveBeenCalled();
    });
  });

  describe('markRead (S3-06)', () => {
    it('emite conversation.read con la fecha que guardó la base', async () => {
      const readAt = new Date('2026-10-30T12:00:00Z');
      prisma.conversation.findUnique.mockResolvedValueOnce({
        userAId: ANA,
        userBId: BETO,
      });
      prisma.$queryRaw.mockResolvedValueOnce([{ readAt }]);

      await service.markRead('c1', BETO);
      expect(events.emit).toHaveBeenCalledWith('conversation.read', {
        conversationId: 'c1',
        userId: BETO,
        readAt,
      });
    });

    it('sin mensajes no actualiza nada ni emite', async () => {
      prisma.conversation.findUnique.mockResolvedValueOnce({
        userAId: ANA,
        userBId: BETO,
      });
      prisma.$queryRaw.mockResolvedValueOnce([]);

      await service.markRead('c1', BETO);
      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  describe('isParticipant y findOneForUser (S3-05)', () => {
    it('isParticipant devuelve true para ambos participantes y false para un tercero o inexistente', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        userAId: ANA,
        userBId: BETO,
      });
      await expect(service.isParticipant('c1', ANA)).resolves.toBe(true);
      await expect(service.isParticipant('c1', BETO)).resolves.toBe(true);
      await expect(service.isParticipant('c1', CARLA)).resolves.toBe(false);

      prisma.conversation.findUnique.mockResolvedValueOnce(null);
      await expect(service.isParticipant('c1', ANA)).resolves.toBe(false);
    });

    it('findOneForUser devuelve la conversación vista por ese usuario o null si no existe', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([row]);
      await expect(service.findOneForUser('c1', ANA)).resolves.toMatchObject({
        id: 'c1',
        otherUser: { id: BETO, username: 'beto' },
      });

      prisma.$queryRaw.mockResolvedValueOnce([]);
      await expect(service.findOneForUser('c1', ANA)).resolves.toBeNull();
    });
  });
});
