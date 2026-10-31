import type { FeedNewEvent } from "@red/api-types";
import { Avatar } from "@/components/avatar";

const MAX_FACES = 3;

/**
 * "Ver N publicaciones nuevas" con las caras de quienes publicaron (S4-15), como en X:
 * lo nuevo no se mete solo en la lista para no mover lo que se está leyendo.
 * events viene del más reciente al más antiguo.
 */
export function NewPostsButton({
  events,
  onShow,
}: {
  events: FeedNewEvent[];
  onShow: () => void;
}) {
  const authors = events
    .map((event) => event.author)
    .filter(
      (author, index, all) =>
        all.findIndex((other) => other.id === author.id) === index,
    )
    .slice(0, MAX_FACES);
  const count = events.length;

  return (
    <button
      type="button"
      onClick={onShow}
      className="new-posts-button my-1 inline-flex items-center gap-2.5 rounded-full bg-action py-1 pr-4 pl-1 text-sm font-semibold text-white shadow-md hover:bg-action-hover"
    >
      <span aria-hidden="true" className="flex">
        {authors.map((author, index) => (
          <span
            key={author.id}
            // Borde del color del fondo: sin foto, las iniciales también son verdes y
            // se perderían contra el botón
            className={`rounded-full ring-2 ring-background ${index > 0 ? "-ml-2" : ""}`}
          >
            <Avatar
              name={author.displayName ?? author.username}
              avatarPublicId={author.avatarPublicId}
              size="xs"
            />
          </span>
        ))}
      </span>
      <span>
        <span aria-hidden="true">↑ </span>
        Ver {count} {count === 1 ? "publicación nueva" : "publicaciones nuevas"}
      </span>
    </button>
  );
}
