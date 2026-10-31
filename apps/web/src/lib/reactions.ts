import type { ReactionType } from "@red/api-types";

// Mismo orden que REACTIONS en la api (S4-12): es el que ve la persona en el selector
export const REACTIONS: { type: ReactionType; label: string; emoji: string }[] = [
  { type: "like", label: "Me gusta", emoji: "👍" },
  { type: "love", label: "Me encanta", emoji: "❤️" },
  { type: "haha", label: "Me divierte", emoji: "😂" },
  { type: "wow", label: "Me asombra", emoji: "😮" },
  { type: "sad", label: "Me entristece", emoji: "😢" },
  { type: "angry", label: "Me enoja", emoji: "😡" },
];

export function reactionInfo(type: ReactionType) {
  return REACTIONS.find((reaction) => reaction.type === type) ?? REACTIONS[0];
}

// Texto de una notificación de reacción; null si ya la quitó (la web usa el texto general)
export function reactionActionText(reaction: ReactionType | null): string | null {
  return reaction ? `reaccionó con ${reactionInfo(reaction).emoji}` : null;
}
