import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash } from '@node-rs/argon2';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

// Pruebas de la lógica de AuthService con Prisma simulado. El flujo completo contra la
// base real está en test/auth.e2e-spec.ts.
describe('AuthService', () => {
  const env: Env = {
    jwtAccessSecret: 'x'.repeat(32),
    jwtAccessTtlSeconds: 900,
    refreshTokenTtlDays: 7,
    corsOrigin: 'http://localhost:3001',
    isProduction: false,
  };
  const prisma = {
    user: { findUnique: jest.fn() },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue('jwt') };
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      env,
    );
    await service.onModuleInit();
  });

  describe('login', () => {
    it('el mismo error si el usuario no existe o la contraseña es incorrecta', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      const missing = service.login({
        identifier: 'nadie',
        password: 'x'.repeat(8),
      });
      await expect(missing).rejects.toThrow(
        new UnauthorizedException('Usuario o contraseña incorrectos'),
      );

      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1',
        passwordHash: await hash('la-correcta'),
      });
      const wrong = service.login({
        identifier: 'ana',
        password: 'otra-clave',
      });
      await expect(wrong).rejects.toThrow(
        new UnauthorizedException('Usuario o contraseña incorrectos'),
      );
    });

    it('busca por correo si el identificador tiene @', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await service
        .login({ identifier: 'ana@example.com', password: 'x' })
        .catch(() => {});
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'ana@example.com' } }),
      );
    });
  });

  describe('refresh', () => {
    const stored = {
      id: 't1',
      userId: 'u1',
      revokedAt: null as Date | null,
      expiresAt: new Date(Date.now() + 60_000),
    };

    it('un token ya revocado cierra todas las sesiones del usuario', async () => {
      prisma.refreshToken.findUnique.mockResolvedValueOnce({
        ...stored,
        revokedAt: new Date(),
      });

      await expect(service.refresh('viejo')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null },
        data: { revokedAt: expect.any(Date) as Date },
      });
    });

    it('si otro refresh rotó el token primero, también cierra todas las sesiones', async () => {
      prisma.refreshToken.findUnique.mockResolvedValueOnce(stored);
      // Dentro de la transacción, la marca condicional no encuentra el token sin revocar
      prisma.$transaction.mockImplementationOnce(
        (fn: (tx: typeof prisma) => Promise<unknown>) => {
          prisma.refreshToken.create.mockResolvedValueOnce({ id: 't2' });
          prisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });
          return fn(prisma);
        },
      );

      await expect(service.refresh('mismo')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenLastCalledWith({
        where: { userId: 'u1', revokedAt: null },
        data: { revokedAt: expect.any(Date) as Date },
      });
    });

    it('un token vencido responde 401 sin revocar nada', async () => {
      prisma.refreshToken.findUnique.mockResolvedValueOnce({
        ...stored,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.refresh('vencido')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });
});
