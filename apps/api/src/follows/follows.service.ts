import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CURSOR_AT_FORMAT,
  decodeCursor,
  PAGE_SIZE,
  toPage,
  type CursorKey,
  type Page,
} from '../common/pagination';
import { DomainEvents } from '../events/domain-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserSummaryDto } from '../users/dto/user-summary.dto';
import { FollowStatusDto } from './dto/follow-status.dto';

// Fila de una lista: el usuario y el momento en que empezó el seguimiento (para el cursor)
interface ListRow extends UserSummaryDto, CursorKey {}

// En followers la lista son quienes siguen al dueño (follower_id) y en following, a quienes
// sigue. Fragmentos fijos de SQL: ningún valor del cliente entra aquí.
const SIDES = {
  followers: {
    member: Prisma.sql`f.follower_id`,
    owner: Prisma.sql`f.following_id`,
  },
  following: {
    member: Prisma.sql`f.following_id`,
    owner: Prisma.sql`f.follower_id`,
  },
} as const;

@Injectable()
export class FollowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEvents,
  ) {}

  // Idempotente (RN06): si ya lo sigo no crea otra fila ni emite follow.created
  async follow(username: string, actorId: string): Promise<FollowStatusDto> {
    const followingId = await this.findId(username);
    if (followingId === actorId) {
      throw new BadRequestException('No puedes seguirte a ti mismo');
    }

    // ON CONFLICT DO NOTHING: dos PUT al mismo tiempo tampoco duplican ni fallan
    const { count } = await this.prisma.follow.createMany({
      data: [{ followerId: actorId, followingId }],
      skipDuplicates: true,
    });
    if (count === 1) {
      this.events.emit('follow.created', { followerId: actorId, followingId });
    }
    return {
      isFollowing: true,
      followerCount: await this.countFollowers(followingId),
    };
  }

  // Idempotente: dejar de seguir a quien no sigo responde lo mismo
  async unfollow(username: string, actorId: string): Promise<FollowStatusDto> {
    const followingId = await this.findId(username);
    await this.prisma.follow.deleteMany({
      where: { followerId: actorId, followingId },
    });
    return {
      isFollowing: false,
      followerCount: await this.countFollowers(followingId),
    };
  }

  async list(
    username: string,
    side: keyof typeof SIDES,
    rawCursor: string | undefined,
  ): Promise<Page<UserSummaryDto>> {
    const cursor = decodeCursor(rawCursor);
    const ownerId = await this.findId(username);
    const { member, owner } = SIDES[side];
    const after = cursor
      ? Prisma.sql`AND (f.created_at, ${member}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
      : Prisma.empty;

    // Los más recientes primero. La fila de más (PAGE_SIZE + 1) indica si hay otra página.
    const rows = await this.prisma.$queryRaw<ListRow[]>`
      SELECT u.id,
             u.username::text AS username,
             u.display_name AS "displayName",
             u.avatar_public_id AS "avatarPublicId",
             to_char(f.created_at AT TIME ZONE 'UTC', ${CURSOR_AT_FORMAT}) AS "createdAt"
      FROM follows f
      JOIN users u ON u.id = ${member}
      WHERE ${owner} = ${ownerId}::uuid ${after}
      ORDER BY f.created_at DESC, ${member} DESC
      LIMIT ${PAGE_SIZE + 1}
    `;
    // createdAt solo sirve para el cursor: no va en UserSummary
    return toPage(rows, ({ id, username, displayName, avatarPublicId }) => ({
      id,
      username,
      displayName,
      avatarPublicId,
    }));
  }

  private async findId(username: string): Promise<string> {
    // citext: la base compara sin distinguir mayúsculas
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user.id;
  }

  // Seguidores no se guarda como columna (D05): se cuenta sobre follows
  private countFollowers(followingId: string): Promise<number> {
    return this.prisma.follow.count({ where: { followingId } });
  }

  // S4-11: ids de quienes siguen a un autor, para enviarles feed:new a user:{id}
  async findFollowerIds(followingId: string): Promise<string[]> {
    const rows = await this.prisma.follow.findMany({
      where: { followingId },
      select: { followerId: true },
    });
    return rows.map((row) => row.followerId);
  }
}
