"use client";

type EmojiGroup = {
  title: string;
  emojis: { emoji: string; name: string }[];
};

// Lista fija, sin librería de selector (S4-10): los emojis más comunes, 8 por fila.
export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    title: "Caras",
    emojis: [
      { emoji: "😀", name: "sonrisa" },
      { emoji: "😂", name: "risa con lágrimas" },
      { emoji: "🤣", name: "carcajada" },
      { emoji: "😊", name: "sonrojado" },
      { emoji: "😍", name: "enamorado" },
      { emoji: "🥰", name: "con corazones" },
      { emoji: "😘", name: "beso" },
      { emoji: "😎", name: "con lentes" },
      { emoji: "🤔", name: "pensando" },
      { emoji: "😅", name: "sudor" },
      { emoji: "😢", name: "triste" },
      { emoji: "😭", name: "llorando" },
      { emoji: "😮", name: "sorprendido" },
      { emoji: "🙄", name: "ojos en blanco" },
      { emoji: "😴", name: "dormido" },
      { emoji: "😡", name: "enojado" },
    ],
  },
  {
    title: "Gestos y símbolos",
    emojis: [
      { emoji: "👍", name: "pulgar arriba" },
      { emoji: "👎", name: "pulgar abajo" },
      { emoji: "👏", name: "aplausos" },
      { emoji: "🙌", name: "manos arriba" },
      { emoji: "🙏", name: "por favor" },
      { emoji: "💪", name: "fuerza" },
      { emoji: "👋", name: "saludo" },
      { emoji: "🤝", name: "apretón de manos" },
      { emoji: "❤️", name: "corazón rojo" },
      { emoji: "💚", name: "corazón verde" },
      { emoji: "🔥", name: "fuego" },
      { emoji: "🎉", name: "fiesta" },
      { emoji: "✨", name: "brillos" },
      { emoji: "💯", name: "cien" },
      { emoji: "✅", name: "listo" },
      { emoji: "👀", name: "ojos" },
    ],
  },
];

/**
 * Panel de emojis (S4-10): en el chat flota encima del campo de mensaje; en los
 * comentarios va dentro del formulario, debajo del cuadro de texto. Quien lo usa
 * decide dónde se ubica (`className`), dónde insertar el emoji (`onPick`) y cuándo
 * cerrarlo. Escape lo cierra sin llegar al formulario que lo contiene (que podría
 * cerrarse también, como el recuadro de comentario del feed).
 */
export function EmojiPicker({
  id,
  onPick,
  onClose,
  className = "",
}: {
  id: string;
  onPick: (emoji: string) => void;
  onClose: () => void;
  className?: string;
}) {
  return (
    <div
      id={id}
      role="dialog"
      aria-label="Elegir emoji"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        onClose();
      }}
      className={`emoji-picker flex flex-col gap-2 bg-background ${className}`}
    >
      {EMOJI_GROUPS.map((group) => (
        <div key={group.title} className="flex flex-col gap-1">
          <span className="px-1 text-[11px] uppercase tracking-[0.08em] text-muted">
            {group.title}
          </span>
          <div className="grid grid-cols-8 gap-0.5">
            {group.emojis.map(({ emoji, name }) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onPick(emoji)}
                aria-label={`Insertar ${name}`}
                title={name}
                className="flex h-11 items-center justify-center rounded-lg text-2xl leading-none outline-primary hover:bg-surface sm:h-9 sm:text-[22px]"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Botón de la carita que abre y cierra el EmojiPicker con `id` = `controls`. */
export function EmojiToggleButton({
  open,
  onToggle,
  controls,
  className = "h-10 w-10",
}: {
  open: boolean;
  onToggle: () => void;
  controls: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={open ? "Cerrar emojis" : "Abrir emojis"}
      aria-expanded={open}
      aria-controls={open ? controls : undefined}
      className={`flex shrink-0 items-center justify-center rounded-lg outline-primary ${className} ${
        open
          ? "bg-surface text-primary"
          : "text-muted hover:bg-surface hover:text-primary"
      }`}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01" />
      </svg>
    </button>
  );
}
