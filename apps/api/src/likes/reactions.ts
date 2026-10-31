import type { Prisma } from '@prisma/client';

// Reacciones de una publicación (S4-12), en el orden que desempata las más usadas.
// Mismos valores que el CHECK post_likes_reaction_check de la base.
export const REACTIONS = [
  'like',
  'love',
  'haha',
  'wow',
  'sad',
  'angry',
] as const;

export type ReactionType = (typeof REACTIONS)[number];

const TOP_REACTIONS = 3;

export function isReaction(value: string): value is ReactionType {
  return (REACTIONS as readonly string[]).includes(value);
}

export interface ReactionCount {
  reaction: string;
  count: number;
}

// Hasta 3, de la más usada a la menos usada; un empate sigue el orden de REACTIONS
export function topReactions(counts: ReactionCount[]): ReactionType[] {
  return counts
    .filter(
      (row): row is { reaction: ReactionType; count: number } =>
        isReaction(row.reaction) && row.count > 0,
    )
    .sort(
      (a, b) =>
        b.count - a.count ||
        REACTIONS.indexOf(a.reaction) - REACTIONS.indexOf(b.reaction),
    )
    .slice(0, TOP_REACTIONS)
    .map((row) => row.reaction);
}

// Las más usadas de varias publicaciones con una sola consulta. Una publicación sin
// reacciones no aparece en el mapa.
export async function loadTopReactions(
  client: Pick<Prisma.TransactionClient, 'postLike'>,
  postIds: string[],
): Promise<Map<string, ReactionType[]>> {
  if (postIds.length === 0) return new Map();
  const rows = await client.postLike.groupBy({
    by: ['postId', 'reaction'],
    where: { postId: { in: postIds } },
    _count: { _all: true },
  });

  const countsByPost = new Map<string, ReactionCount[]>();
  for (const row of rows) {
    const counts = countsByPost.get(row.postId) ?? [];
    counts.push({ reaction: row.reaction, count: row._count._all });
    countsByPost.set(row.postId, counts);
  }
  return new Map(
    [...countsByPost].map(([postId, counts]) => [postId, topReactions(counts)]),
  );
}
