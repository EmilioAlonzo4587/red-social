import {
  BadRequestException,
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
  parentId: true,
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
  parentId: string | null;
  content: string;
  deleted: boolean;
  replyCount: number;
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

  // Comentarios de primer nivel, del más antiguo al más reciente (docs/05-api.md): la
  // conversación se lee de arriba abajo, por eso el cursor compara con > y no con < como
  // los feeds. Las respuestas se piden aparte (listReplies, S4-14). Un comentario eliminado
  // sigue apareciendo, sin texto, mientras tenga respuestas visibles: si no, el hilo
  // quedaría sin su comienzo.
  async list(postId: string, rawCursor?: string): Promise<CommentPageDto> {
    const cursor = decodeCursor(rawCursor);
    await this.findVisiblePost(this.prisma, postId);
    const after = cursor
      ? Prisma.sql`AND (c.created_at, c.id) > (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<ListRow[]>`
      SELECT * FROM (
        SELECT c.id,
               c.post_id AS "postId",
               c.parent_id AS "parentId",
               c.content,
               c.deleted_at IS NOT NULL AS deleted,
               (SELECT count(*)::int FROM comments r
                WHERE r.parent_id = c.id AND r.deleted_at IS NULL) AS "replyCount",
               to_char(c.created_at AT TIME ZONE 'UTC', ${CURSOR_AT_FORMAT}) AS "createdAt",
               c.created_at AS sort_at,
               u.id AS "authorId",
               u.username::text AS username,
               u.display_name AS "displayName",
               u.avatar_public_id AS "avatarPublicId"
        FROM comments c
        JOIN users u ON u.id = c.author_id
        WHERE c.post_id = ${postId}::uuid AND c.parent_id IS NULL ${after}
      ) top
      WHERE NOT top.deleted OR top."replyCount" > 0
      ORDER BY top.sort_at ASC, top.id ASC
      LIMIT ${PAGE_SIZE + 1}
    `;
    return toPage(rows, toCommentDto);
  }

  // Respuestas de un comentario de primer nivel (S4-14), del más antiguo al más reciente
  // y paginadas igual que los comentarios. 404 si el comentario o su publicación no se ven.
  async listReplies(
    commentId: string,
    rawCursor?: string,
  ): Promise<CommentPageDto> {
    const cursor = decodeCursor(rawCursor);
    const parent = await this.prisma.comment.findFirst({
      where: { id: commentId, post: { deletedAt: null } },
      select: { id: true },
    });
    if (!parent) throw new NotFoundException('Comentario no encontrado');
    const after = cursor
      ? Prisma.sql`AND (c.created_at, c.id) > (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<ListRow[]>`
      SELECT c.id,
             c.post_id AS "postId",
             c.parent_id AS "parentId",
             c.content,
             false AS deleted,
             0 AS "replyCount",
             to_char(c.created_at AT TIME ZONE 'UTC', ${CURSOR_AT_FORMAT}) AS "createdAt",
             u.id AS "authorId",
             u.username::text AS username,
             u.display_name AS "displayName",
             u.avatar_public_id AS "avatarPublicId"
      FROM comments c
      JOIN users u ON u.id = c.author_id
      WHERE c.parent_id = ${commentId}::uuid AND c.deleted_at IS NULL ${after}
      ORDER BY c.created_at ASC, c.id ASC
      LIMIT ${PAGE_SIZE + 1}
    `;
    return toPage(rows, toCommentDto);
  }

  // El comentario y comment_count cambian en la misma transacción (D05); comment_count
  // cuenta también las respuestas. El autor siempre es el usuario de la sesión, nunca un
  // dato del cliente. Con parentId es una respuesta (S4-14): el padre tiene que verse y ser
  // de la misma publicación, y si el padre ya es una respuesta, la nueva va al mismo hilo.
  async create(
    postId: string,
    authorId: string,
    dto: CreateCommentDto,
  ): Promise<CommentDto> {
    const { comment, postAuthorId, commentCount, replyToAuthorId } =
      await this.prisma.$transaction(async (tx) => {
        const post = await this.findVisiblePost(tx, postId);
        const replyTo = dto.parentId
          ? await this.findReplyTarget(tx, postId, dto.parentId)
          : null;
        const comment = await tx.comment.create({
          data: {
            postId,
            authorId,
            content: dto.content,
            parentId: replyTo?.threadId ?? null,
          },
          select: COMMENT_SELECT,
        });
        const { commentCount } = await tx.post.update({
          where: { id: postId },
          data: { commentCount: { increment: 1 } },
          select: { commentCount: true },
        });
        return {
          comment,
          postAuthorId: post.authorId,
          commentCount,
          replyToAuthorId: replyTo?.authorId ?? null,
        };
      });

    this.events.emit('comment.changed', {
      postId,
      postAuthorId,
      actorId: authorId,
      commentId: comment.id,
      change: 'added',
      commentCount,
      replyToAuthorId,
    });
    return { ...comment, replyCount: 0, deleted: false };
  }

  // RN04: solo el autor del comentario, con borrado lógico. Un comentario de una
  // publicación eliminada ya no se ve, así que también responde 404. Sus respuestas se
  // conservan (S4-14): el comentario se sigue listando, sin texto, mientras tenga alguna.
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
        replyToAuthorId: null,
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

  // El comentario al que se responde: tiene que verse y ser de esta publicación. Devuelve
  // el hilo (su padre si ya es una respuesta: un solo nivel) y su autor, a quien se avisa.
  private async findReplyTarget(
    client: Prisma.TransactionClient,
    postId: string,
    parentId: string,
  ): Promise<{ threadId: string; authorId: string }> {
    const target = await client.comment.findFirst({
      where: { id: parentId, postId, deletedAt: null },
      select: { id: true, parentId: true, authorId: true },
    });
    if (!target) {
      throw new BadRequestException({
        message:
          'parentId: el comentario no existe, fue eliminado o es de otra publicación',
        details: [{ field: 'parentId', rule: 'parent' }],
      });
    }
    return {
      threadId: target.parentId ?? target.id,
      authorId: target.authorId,
    };
  }
}

function toCommentDto(row: ListRow): CommentDto {
  return {
    id: row.id,
    postId: row.postId,
    parentId: row.parentId,
    content: row.deleted ? null : row.content,
    createdAt: new Date(row.createdAt),
    replyCount: row.replyCount,
    deleted: row.deleted,
    author: {
      id: row.authorId,
      username: row.username,
      displayName: row.displayName,
      avatarPublicId: row.avatarPublicId,
    },
  };
}
