import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { MeDto } from './dto/me.dto';
import { RegisterDto } from './dto/register.dto';

// Lo que reciben las cookies después de registrarse, iniciar sesión o renovar
export interface Session {
  accessToken: string;
  refreshToken: string;
}

// Campos del objeto Me (docs/05-api.md). Nunca passwordHash.
const ME_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarPublicId: true,
  email: true,
  bio: true,
  createdAt: true,
} as const;

// El mismo mensaje para "no existe" y "contraseña incorrecta" (no revela qué cuentas hay)
const INVALID_LOGIN = 'Usuario o contraseña incorrectos';
const INVALID_REFRESH = 'Sesión vencida';

// Se lanza dentro de la transacción de rotación cuando otro refresh ya usó el mismo token
class TokenAlreadyRotated extends Error {}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  // Hash de relleno: el login lo verifica cuando el usuario no existe, para que la
  // respuesta tarde lo mismo que con un usuario real
  private dummyHash = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await hash(randomBytes(16).toString('hex'));
  }

  async register(
    dto: RegisterDto,
    userAgent?: string,
  ): Promise<{ me: MeDto; session: Session }> {
    // @node-rs/argon2 usa argon2id por defecto
    const passwordHash = await hash(dto.password);
    // Si el usuario o el correo ya existen, la base responde P2002 y el filtro global
    // lo convierte en 409. Así también se cubren dos registros al mismo tiempo.
    const me = await this.prisma.user.create({
      data: { username: dto.username, email: dto.email, passwordHash },
      select: ME_SELECT,
    });
    return { me, session: await this.startSession(me.id, userAgent) };
  }

  async login(
    dto: LoginDto,
    userAgent?: string,
  ): Promise<{ me: MeDto; session: Session }> {
    // citext: la base compara sin distinguir mayúsculas
    const where = dto.identifier.includes('@')
      ? { email: dto.identifier }
      : { username: dto.identifier };
    const user = await this.prisma.user.findUnique({
      where,
      select: { ...ME_SELECT, passwordHash: true },
    });

    if (!user) {
      await verify(this.dummyHash, dto.password);
      throw new UnauthorizedException(INVALID_LOGIN);
    }
    const { passwordHash, ...me } = user;
    if (!(await verify(passwordHash, dto.password))) {
      throw new UnauthorizedException(INVALID_LOGIN);
    }
    return { me, session: await this.startSession(user.id, userAgent) };
  }

  async me(userId: string): Promise<MeDto> {
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: ME_SELECT,
    });
    if (!me) throw new UnauthorizedException(INVALID_REFRESH);
    return me;
  }

  // Rotación (RN12): cada refresh entrega un token nuevo y marca el viejo como usado.
  async refresh(
    rawToken: string | undefined,
    userAgent?: string,
  ): Promise<Session> {
    if (!rawToken) throw new UnauthorizedException(INVALID_REFRESH);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
    });
    if (!stored) throw new UnauthorizedException(INVALID_REFRESH);

    // Ya estaba revocado: alguien reutiliza un token viejo (robado o duplicado).
    // Se cierran todas las sesiones del usuario.
    if (stored.revokedAt) {
      await this.revokeAll(stored.userId);
      throw new UnauthorizedException(INVALID_REFRESH);
    }
    if (stored.expiresAt <= new Date()) {
      throw new UnauthorizedException(INVALID_REFRESH);
    }

    const next = newRefreshToken();
    try {
      await this.prisma.$transaction(async (tx) => {
        const created = await tx.refreshToken.create({
          data: {
            userId: stored.userId,
            tokenHash: next.hash,
            expiresAt: this.refreshExpiry(),
            userAgent: cut(userAgent),
          },
        });
        // Condicional: si dos refresh llegan a la vez con el mismo token, solo uno
        // encuentra revokedAt en null. El otro actualiza 0 filas y cuenta como reutilización.
        const { count } = await tx.refreshToken.updateMany({
          where: { id: stored.id, revokedAt: null },
          data: { revokedAt: new Date(), replacedBy: created.id },
        });
        if (count === 0) throw new TokenAlreadyRotated();
      });
    } catch (error) {
      if (error instanceof TokenAlreadyRotated) {
        await this.revokeAll(stored.userId);
        throw new UnauthorizedException(INVALID_REFRESH);
      }
      throw error;
    }

    return {
      accessToken: await this.signAccess(stored.userId),
      refreshToken: next.raw,
    };
  }

  // Cierra solo la sesión de este navegador. Sin token o con uno inválido no hace nada.
  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeAll(userId: string): Promise<void> {
    this.logger.warn(
      `Reutilización de refresh token: se cierran las sesiones de ${userId}`,
    );
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async startSession(
    userId: string,
    userAgent?: string,
  ): Promise<Session> {
    const refresh = newRefreshToken();
    // Limpieza: los tokens vencidos de este usuario ya no sirven ni para detectar reutilización
    await this.prisma.refreshToken.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    });
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: refresh.hash,
        expiresAt: this.refreshExpiry(),
        userAgent: cut(userAgent),
      },
    });
    return {
      accessToken: await this.signAccess(userId),
      refreshToken: refresh.raw,
    };
  }

  // JWT firmado con HS256 y JWT_ACCESS_SECRET; vence según JWT_ACCESS_TTL (JwtModule)
  private signAccess(userId: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId });
  }

  private refreshExpiry(): Date {
    return new Date(
      Date.now() + this.env.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
    );
  }
}

// 32 bytes aleatorios (256 bits). En la base solo se guarda su SHA-256: si alguien lee la
// tabla no puede usar los tokens. No hace falta argon2 porque no se puede adivinar por fuerza bruta.
function newRefreshToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: sha256(raw) };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function cut(userAgent?: string): string | null {
  return userAgent ? userAgent.slice(0, 500) : null;
}
