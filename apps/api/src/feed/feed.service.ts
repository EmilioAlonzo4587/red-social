import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CURSOR_AT_FORMAT,
  decodeCursor,
  PAGE_SIZE,
  toPage,
  type CursorKey,
} from '../common/pagination';
import { loadTopReactions } from '../likes/reactions';
import { postSelect, toPostDto } from '../posts/post-select';
import { PrismaService } from '../prisma/prisma.service';
import { PostPageDto } from './dto/post-page.dto';

@Injectable()
export class FeedService {
  constructor(private readonly prisma: PrismaService) {}

  // Siguiendo (RN10): las propias y las de quienes sigo
  following(viewerId: string, cursor?: string): Promise<PostPageDto> {
    return this.page(
      viewerId,
      cursor,
      Prisma.sql`AND (p.author_id = ${viewerId}::uuid OR p.author_id IN (
        SELECT f.following_id FROM follows f WHERE f.follower_id = ${viewerId}::uuid
      ))`,
    );
  }

  // Explorar (RN10): todas
  explore(viewerId: string, cursor?: string): Promise<PostPageDto> {
    return this.page(viewerId, cursor, Prisma.empty);
  }

  // Perfil: las de un usuario; 404 si no existe
  async byUser(
    username: string,
    viewerId: string,
    cursor?: string,
  ): Promise<PostPageDto> {
    // citext: la base compara sin distinguir mayúsculas
    const author = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (!author) throw new NotFoundException('Usuario no encontrado');
    return this.page(
      viewerId,
      cursor,
      Prisma.sql`AND p.author_id = ${author.id}::uuid`,
    );
  }

  // Dos pasos: primero los ids de la página con $queryRaw, porque el cursor necesita
  // created_at con microsegundos (ver common/pagination.ts), y luego las publicaciones
  // completas con el mismo postSelect que GET /posts/:id. Los índices parciales
  // posts_created_idx y posts_author_created_idx cubren este orden sin OFFSET.
  private async page(
    viewerId: string,
    rawCursor: string | undefined,
    filter: Prisma.Sql,
  ): Promise<PostPageDto> {
    const cursor = decodeCursor(rawCursor);
    const after = cursor
      ? Prisma.sql`AND (p.created_at, p.id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
      : Prisma.empty;

    const keys = await this.prisma.$queryRaw<CursorKey[]>`
      SELECT p.id,
             to_char(p.created_at AT TIME ZONE 'UTC', ${CURSOR_AT_FORMAT}) AS "createdAt"
      FROM posts p
      WHERE p.deleted_at IS NULL ${filter} ${after}
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT ${PAGE_SIZE + 1}
    `;

    const ids = keys.slice(0, PAGE_SIZE).map((k) => k.id);
    const posts = await this.prisma.post.findMany({
      where: { id: { in: ids } },
      select: postSelect(viewerId),
    });
    const top = await loadTopReactions(this.prisma, ids);
    const byId = new Map(
      posts.map((post) => [post.id, toPostDto(post, top.get(post.id))]),
    );

    // findMany no garantiza el orden: se respeta el de la consulta del cursor. Si una fila
    // se borró del todo entre las dos consultas (cuenta eliminada), se omite.
    const page = toPage(keys, ({ id }) => byId.get(id));
    return {
      items: page.items.filter((post) => post !== undefined),
      nextCursor: page.nextCursor,
    };
  }
}
