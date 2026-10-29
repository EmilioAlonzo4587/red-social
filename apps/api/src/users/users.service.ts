import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MeDto } from '../auth/dto/me.dto';
import { CloudinaryService } from '../media/cloudinary.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileDto } from './dto/profile.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { UserSummaryDto } from './dto/user-summary.dto';

// RN14: como máximo 20 resultados
const SEARCH_LIMIT = 20;

// En LIKE, % y _ son comodines y \ es el carácter de escape: se escapan para que el texto
// del usuario se busque tal cual ("a_b" no debe encontrar "axb").
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// Campos del objeto Me (docs/05-api.md), los mismos que devuelve GET /auth/me. Nunca passwordHash.
const ME_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarPublicId: true,
  email: true,
  bio: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  // Por fragmento de username o displayName, sin distinguir mayúsculas. lower(...) LIKE usa
  // los índices GIN de trigramas de la migración inicial (users_*_trgm_idx). Primero los que
  // empiezan con el texto (docs/05-api.md) y luego por username, para un orden estable.
  // En el ORDER BY, display_name NULL daría NULL en vez de false, y en DESC los NULL van
  // primero: por eso COALESCE. En el WHERE no hace falta, NULL ya cuenta como no coincide.
  search(q: string): Promise<UserSummaryDto[]> {
    const text = escapeLike(q.toLowerCase());
    const contains = `%${text}%`;
    const startsWith = `${text}%`;
    return this.prisma.$queryRaw<UserSummaryDto[]>`
      SELECT id,
             username::text AS username,
             display_name AS "displayName",
             avatar_public_id AS "avatarPublicId"
      FROM users
      WHERE lower(username::text) LIKE ${contains} ESCAPE '\\'
         OR lower(display_name) LIKE ${contains} ESCAPE '\\'
      ORDER BY (lower(username::text) LIKE ${startsWith} ESCAPE '\\'
                OR lower(coalesce(display_name, '')) LIKE ${startsWith} ESCAPE '\\') DESC,
               lower(username::text) ASC
      LIMIT ${SEARCH_LIMIT}
    `;
  }

  // Una sola consulta: los contadores salen de _count (seguidores y seguidos no se guardan
  // como columna, D05) y "lo sigo" de buscar la fila del usuario con sesión en sus seguidores.
  async profile(username: string, viewerId: string): Promise<ProfileDto> {
    // citext: la base compara sin distinguir mayúsculas
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarPublicId: true,
        bio: true,
        createdAt: true,
        _count: {
          select: {
            posts: { where: { deletedAt: null } },
            followers: true,
            following: true,
          },
        },
        followers: {
          where: { followerId: viewerId },
          select: { followerId: true },
          take: 1,
        },
      },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const { _count, followers, ...summary } = user;
    return {
      ...summary,
      postCount: _count.posts,
      followerCount: _count.followers,
      followingCount: _count.following,
      // Nadie se sigue a sí mismo (RN06, CHECK follows_no_self)
      isFollowing: user.id !== viewerId && followers.length > 0,
    };
  }

  // undefined no cambia la columna y null la borra: Prisma ya lo interpreta así.
  // Si cambia el avatar, el anterior se borra de Cloudinary (S2-01, RN04 para el nuevo).
  async updateMe(userId: string, dto: UpdateMeDto): Promise<MeDto> {
    if (
      dto.avatarPublicId != null &&
      !this.cloudinary.belongsToUser(dto.avatarPublicId, userId)
    ) {
      throw new BadRequestException({
        message: 'avatarPublicId: no pertenece al usuario',
        details: [{ field: 'avatarPublicId', rule: 'ownership' }],
      });
    }

    const previous =
      dto.avatarPublicId !== undefined
        ? await this.prisma.user.findUnique({
            where: { id: userId },
            select: { avatarPublicId: true },
          })
        : null;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        displayName: dto.displayName,
        bio: dto.bio,
        avatarPublicId: dto.avatarPublicId,
      },
      select: ME_SELECT,
    });

    if (
      previous?.avatarPublicId &&
      previous.avatarPublicId !== dto.avatarPublicId
    ) {
      await this.cloudinary
        .deleteByPublicId(previous.avatarPublicId)
        .catch((error: unknown) => {
          this.logger.error(
            `No se pudo borrar el avatar anterior ${previous.avatarPublicId}: ${String(error)}`,
          );
        });
    }

    return updated;
  }
}
