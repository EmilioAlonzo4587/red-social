import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CountChange } from '../events/domain-events';
import { DomainEvents } from '../events/domain-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { LikeStatusDto } from './dto/like-status.dto';

@Injectable()
export class LikesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEvents,
  ) {}

  // Idempotente (RN05): si ya le di like no crea otra fila, no cambia el contador y no
  // emite like.changed. ON CONFLICT DO NOTHING: dos PUT al mismo tiempo tampoco duplican.
  like(postId: string, userId: string): Promise<LikeStatusDto> {
    return this.change(postId, userId, 'added', async (tx) => {
      const { count } = await tx.postLike.createMany({
        data: [{ userId, postId }],
        skipDuplicates: true,
      });
      return count === 1;
    });
  }

  // Quitar un like que no existe responde igual, con el contador sin cambios
  unlike(postId: string, userId: string): Promise<LikeStatusDto> {
    return this.change(postId, userId, 'removed', async (tx) => {
      const { count } = await tx.postLike.deleteMany({
        where: { userId, postId },
      });
      return count === 1;
    });
  }

  // La fila del like y like_count cambian en la misma transacción (D05). El evento sale
  // después de confirmarla, solo si el contador cambió.
  private async change(
    postId: string,
    userId: string,
    change: CountChange,
    write: (tx: Prisma.TransactionClient) => Promise<boolean>,
  ): Promise<LikeStatusDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      const post = await tx.post.findFirst({
        where: { id: postId, deletedAt: null },
        select: { authorId: true, likeCount: true },
      });
      if (!post) throw new NotFoundException('Publicación no encontrada');

      if (!(await write(tx))) {
        return {
          changed: false,
          authorId: post.authorId,
          likeCount: post.likeCount,
        };
      }
      const { likeCount } = await tx.post.update({
        where: { id: postId },
        data: {
          likeCount: change === 'added' ? { increment: 1 } : { decrement: 1 },
        },
        select: { likeCount: true },
      });
      return { changed: true, authorId: post.authorId, likeCount };
    });

    if (result.changed) {
      this.events.emit('like.changed', {
        postId,
        postAuthorId: result.authorId,
        actorId: userId,
        change,
        likeCount: result.likeCount,
      });
    }
    return { likeCount: result.likeCount, likedByMe: change === 'added' };
  }
}
