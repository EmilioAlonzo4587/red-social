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
