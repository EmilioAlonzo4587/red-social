import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { LikeChange } from '../events/domain-events';
import { DomainEvents } from '../events/domain-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { LikeStatusDto } from './dto/like-status.dto';
import { loadTopReactions, type ReactionType } from './reactions';

@Injectable()
export class LikesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEvents,
  ) {}

  // Una sola reacción por persona (RN05). Repetir la misma no cambia nada ni emite
  // like.changed; elegir otra la reemplaza sin sumar al total. ON CONFLICT DO NOTHING:
  // dos PUT al mismo tiempo tampoco duplican.
  react(
    postId: string,
    userId: string,
    reaction: ReactionType = 'like',
  ): Promise<LikeStatusDto> {
    return this.change(postId, userId, reaction, async (tx) => {
      const { count } = await tx.postLike.createMany({
        data: [{ userId, postId, reaction }],
        skipDuplicates: true,
      });
      if (count === 1) return 'added';
      const updated = await tx.postLike.updateMany({
        where: { userId, postId, reaction: { not: reaction } },
        data: { reaction },
      });
      return updated.count === 1 ? 'changed' : null;
    });
  }

  // Quitar una reacción que no existe responde igual, con el contador sin cambios
  unreact(postId: string, userId: string): Promise<LikeStatusDto> {
    return this.change(postId, userId, null, async (tx) => {
      const { count } = await tx.postLike.deleteMany({
        where: { userId, postId },
      });
      return count === 1 ? 'removed' : null;
    });
  }

  // La fila de la reacción y like_count cambian en la misma transacción (D05). El evento
  // sale después de confirmarla, solo si algo cambió.
  private async change(
    postId: string,
    userId: string,
    myReaction: ReactionType | null,
    write: (tx: Prisma.TransactionClient) => Promise<LikeChange | null>,
  ): Promise<LikeStatusDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      const post = await tx.post.findFirst({
        where: { id: postId, deletedAt: null },
        select: { authorId: true, likeCount: true },
      });
      if (!post) throw new NotFoundException('Publicación no encontrada');

      const change = await write(tx);
      let likeCount = post.likeCount;
      if (change === 'added' || change === 'removed') {
        const updated = await tx.post.update({
          where: { id: postId },
          data: {
            likeCount: change === 'added' ? { increment: 1 } : { decrement: 1 },
          },
          select: { likeCount: true },
        });
        likeCount = updated.likeCount;
      }
      const top = await loadTopReactions(tx, [postId]);
      return {
        change,
        authorId: post.authorId,
        likeCount,
        topReactions: top.get(postId) ?? [],
      };
    });

    if (result.change) {
      this.events.emit('like.changed', {
        postId,
        postAuthorId: result.authorId,
        actorId: userId,
        change: result.change,
        likeCount: result.likeCount,
        topReactions: result.topReactions,
      });
    }
    return {
      likeCount: result.likeCount,
      likedByMe: myReaction !== null,
      myReaction,
      topReactions: result.topReactions,
    };
  }
}
