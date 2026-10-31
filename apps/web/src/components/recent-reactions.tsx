"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactionType, RecentReactionsDto } from "@red/api-types";
import { Avatar } from "@/components/avatar";
import { apiFetchClient } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/format";
import { reactionInfo } from "@/lib/reactions";

// Alto aproximado de la ventana con 5 filas más la barra inferior del celular (64px): si
// abajo no hay ese espacio, se abre hacia arriba para que no la tape
const SPACE_NEEDED_BELOW = 360;

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: RecentReactionsDto };

/**
 * El contador de reacciones de PostCard (S4-16): al tocarlo abre una ventana con las 5
 * reacciones más recientes (GET /api/posts/:id/reactions). Se pide de nuevo en cada
 * apertura, así siempre está al día. Se cierra con el mismo botón, Escape o un clic fuera.
 * El panel se ubica contra el contenedor posicionado más cercano (la fila de acciones de
 * PostCard), para no salirse de la pantalla en el celular.
 */
export function RecentReactions({
  postId,
  likeCount,
  topReactions,
}: {
  postId: string;
  likeCount: number;
  topReactions: ReactionType[];
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ status: "loading" });
  const [placement, setPlacement] = useState<"below" | "above">("below");
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const label = `${likeCount} ${likeCount === 1 ? "reacción" : "reacciones"}${
    topReactions.length > 0
      ? `: ${topReactions.map((type) => reactionInfo(type).label).join(", ")}`
      : ""
  }`;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    apiFetchClient<RecentReactionsDto>(`/api/posts/${postId}/reactions`)
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });

    function handlePointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelled = true;
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, postId]);

  return (
    <span ref={wrapperRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          // Cada apertura vuelve a pedir la lista: muestra "Cargando…" hasta que llegue
          if (!open) {
            setState({ status: "loading" });
            const rect = buttonRef.current?.getBoundingClientRect();
            const spaceBelow = rect ? window.innerHeight - rect.bottom : Infinity;
            setPlacement(spaceBelow < SPACE_NEEDED_BELOW ? "above" : "below");
          }
          setOpen(!open);
        }}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`${label}. Ver quién reaccionó`}
        className="tap-area rounded-lg text-muted hover:text-foreground"
      >
        {topReactions.map((type) => reactionInfo(type).emoji).join("")}{" "}
        {likeCount}
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Reacciones recientes"
          className={`recent-reactions absolute left-0 z-20 w-[min(18rem,calc(100vw-2rem))] ${
            placement === "below" ? "top-full mt-2" : "bottom-full mb-2"
          } rounded-xl border border-border bg-background p-2 shadow-lg`}
        >
          <p className="px-2 pt-1 pb-2 text-xs font-semibold text-muted">
            Reacciones recientes
            {state.status === "ready" && state.data.total > 0 && (
              <span className="font-normal"> · {state.data.total} en total</span>
            )}
          </p>

          {state.status === "loading" && (
            <p className="px-2 py-3 text-sm text-muted">Cargando…</p>
          )}
          {state.status === "error" && (
            <p className="px-2 py-3 text-sm text-danger">
              No se pudieron cargar las reacciones.
            </p>
          )}
          {state.status === "ready" && state.data.items.length === 0 && (
            <p className="px-2 py-3 text-sm text-muted">
              Todavía nadie reaccionó.
            </p>
          )}
          {state.status === "ready" && state.data.items.length > 0 && (
            <ul className="flex flex-col">
              {state.data.items.map((item) => {
                const name = item.user.displayName ?? item.user.username;
                const info = reactionInfo(item.reaction);
                return (
                  <li key={item.user.id}>
                    <Link
                      href={`/u/${encodeURIComponent(item.user.username)}`}
                      className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface"
                    >
                      <Avatar
                        name={name}
                        avatarPublicId={item.user.avatarPublicId}
                        size="sm"
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {name}
                        </span>
                        <span className="truncate text-xs text-muted">
                          @{item.user.username} ·{" "}
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </span>
                      <span className="text-lg" role="img" aria-label={info.label}>
                        {info.emoji}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </span>
  );
}
