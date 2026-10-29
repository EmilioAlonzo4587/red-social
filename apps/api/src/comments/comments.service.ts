import {
  ForbiddenException,
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
} from '../common/pagination';
import { DomainEvents } from '../events/domain-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommentDto, CommentPageDto } from './dto/comment.dto';
import { CreateCommentDto } from './dto/create-comment.dto';

// Campos de Comment (docs/05-api.md) para Prisma
const COMMENT_SELECT = {
  id: true,
  postId: true,
  content: true,
  createdAt: true,
  author: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarPublicId: true,
    },
  },
} satisfies Prisma.CommentSelect;

// Fila de la lista: el comentario (id y created_at con microsegundos, para el cursor) y su autor
interface ListRow extends CursorKey {
  postId: string;
  content: string;
  authorId: string;
  username: string;
  displayName: string | null;
  avatarPublicId: string | null;
}

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEvents,
  ) {}

  // Del más antiguo al más reciente (docs/05-api.md): la conversación se lee de arriba abajo.
  // Por eso el cursor compara con > y no con < como los feeds.
  async list(postId: string, rawCursor?: string): Promise<CommentPageDto> {
    const cursor = decodeCursor(rawCursor);
    await this.findVisiblePost(this.prisma, postId);
    const after = cursor
      ? Prisma.sql`AND (c.created_at, c.id) > (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<ListRow[]>`
      SELECT c.id,
             c.post_id AS "postId",
             c.content,
             to_char(c.created_at AT TIME ZONE 'UTC', ${CURSOR_AT_FORMAT}) AS "createdAt",
             u.id AS "authorId",
             u.username::text AS username,
             u.display_name AS "displayName",
             u.avatar_public_id AS "avatarPublicId"
      FROM comments c
      JOIN users u ON u.id = c.author_id
      WHERE c.post_id = ${postId}::uuid AND c.deleted_at IS NULL ${after}
      ORDER BY c.created_at ASC, c.id ASC
      LIMIT ${PAGE_SIZE + 1}
    `;
    return toPage(rows, toCommentDto);
  }

  // El comentario y comment_count cambian en la misma transacción (D05). El autor
  // siempre es el usuario de la sesión, nunca un dato del cliente.
  async create(
    postId: string,
    authorId: string,
    dto: CreateCommentDto,
  ): Promise<CommentDto> {
    const { comment, postAuthorId, commentCount } =
      await this.prisma.$transaction(async (tx) => {
        const post = await this.findVisiblePost(tx, postId);
        const comment = await tx.comment.create({
          data: { postId, authorId, content: dto.content },
          select: COMMENT_SELECT,
        });
        const { commentCount } = await tx.post.update({
          where: { id: postId },
          data: { commentCount: { increment: 1 } },
          select: { commentCount: true },
        });
        return { comment, postAuthorId: post.authorId, commentCount };
      });

    this.events.emit('comment.changed', {
      postId,
      postAuthorId,
      actorId: authorId,
      commentId: comment.id,
      change: 'added',
      commentCount,
    });
    return comment;
  }

  // RN04: solo el autor del comentario, con borrado lógico. Un comentario de una
  // publicación eliminada ya no se ve, así que también responde 404.
  async remove(commentId: string, userId: string): Promise<void> {
    const result = await this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.findFirst({
        where: { id: commentId, deletedAt: null, post: { deletedAt: null } },
        select: {
          authorId: true,
          postId: true,
          post: { select: { authorId: true } },
        },
      });
      if (!comment) throw new NotFoundException('Comentario no encontrado');
      if (comment.authorId !== userId) {
        throw new ForbiddenException(
          'Solo el autor puede eliminar su comentario',
        );
      }

      // updateMany con deletedAt null: si dos DELETE llegan juntos, solo uno resta
      const { count } = await tx.comment.updateMany({
        where: { id: commentId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (count === 0) return null;
      const { commentCount } = await tx.post.update({
        where: { id: comment.postId },
        data: { commentCount: { decrement: 1 } },
        select: { commentCount: true },
      });
      return { ...comment, commentCount };
    });

    if (result) {
      this.events.emit('comment.changed', {
        postId: result.postId,
        postAuthorId: result.post.authorId,
        actorId: userId,
        commentId,
        change: 'removed',
        commentCount: result.commentCount,
      });
    }
  }

  private async findVisiblePost(
    client: Prisma.TransactionClient,
    postId: string,
  ): Promise<{ authorId: string }> {
    const post = await client.post.findFirst({
      where: { id: postId, deletedAt: null },
      select: { authorId: true },
    });
    if (!post) throw new NotFoundException('Publicación no encontrada');
    return post;
  }
}

function toCommentDto(row: ListRow): CommentDto {
  return {
    id: row.id,
    postId: row.postId,
    content: row.content,
    createdAt: new Date(row.createdAt),
    author: {
      id: row.authorId,
      username: row.username,
      displayName: row.displayName,
      avatarPublicId: row.avatarPublicId,
    },
  };
}
