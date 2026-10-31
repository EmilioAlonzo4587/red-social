import type { Prisma } from '@prisma/client';
import { isReaction, type ReactionType } from '../likes/reactions';
import type { PostDto } from './dto/post.dto';

// Campos que necesita un Post (docs/05-api.md) vistos por viewerId. Los comparten
// GET /posts/:id y los feeds (S2-05) para que todos devuelvan el mismo objeto.
export function postSelect(viewerId: string) {
  return {
    id: true,
    content: true,
    likeCount: true,
    commentCount: true,
    createdAt: true,
    editedAt: true,
    author: {
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarPublicId: true,
      },
    },
    media: {
      select: { publicId: true, width: true, height: true },
      orderBy: { position: 'asc' },
    },
    // Mi reacción: a lo sumo una fila, la del usuario con sesión (PK user_id, post_id)
    likes: { where: { userId: viewerId }, select: { reaction: true }, take: 1 },
  } satisfies Prisma.PostSelect;
}

export type PostRow = Prisma.PostGetPayload<{
  select: ReturnType<typeof postSelect>;
}>;

// topReactions sale aparte (loadTopReactions): necesita contar por tipo, y Prisma no agrupa
// dentro de un select.
export function toPostDto(
  row: PostRow,
  topReactions: ReactionType[] = [],
): PostDto {
  const { likes, media, ...rest } = row;
  const mine = likes[0]?.reaction;
  return {
    ...rest,
    // La api solo guarda imágenes (RN03) y siempre con sus medidas, aunque las columnas
    // admitan null: el 0 nunca debería verse.
    media: media.map((m) => ({
      publicId: m.publicId,
      mediaType: 'image',
      width: m.width ?? 0,
      height: m.height ?? 0,
    })),
    likedByMe: likes.length > 0,
    myReaction: mine !== undefined && isReaction(mine) ? mine : null,
    topReactions,
  };
}
