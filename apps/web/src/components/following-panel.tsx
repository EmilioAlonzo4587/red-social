"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { UserSummaryDto, UserSummaryPageDto } from "@red/api-types";
import { Avatar } from "@/components/avatar";
import { FollowListModal } from "@/components/follow-list-modal";
import { apiFetchClient } from "@/lib/api-client";

// Cuántos seguidos se muestran en la columna derecha de /feed; el resto, en "Ver todos".
export const FOLLOWING_PANEL_LIMIT = 10;

type Status = "loading" | "ready" | "error";

/**
 * Personas que sigues, debajo de "Tu perfil" en /feed: la primera página de
 * GET /api/users/{username}/following (las más recientes primero), recortada a
 * FOLLOWING_PANEL_LIMIT. Si hay más, "Ver todos" abre el mismo modal paginado
 * del perfil (S3-10).
 */
export function FollowingPanel({ username }: { username: string }) {
  const [items, setItems] = useState<UserSummaryDto[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetchClient<UserSummaryPageDto>(
      `/api/users/${encodeURIComponent(username)}/following`,
    )
      .then((page) => {
        if (cancelled) return;
        setItems(page.items.slice(0, FOLLOWING_PANEL_LIMIT));
        setHasMore(
          page.items.length > FOLLOWING_PANEL_LIMIT || page.nextCursor !== null,
        );
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  return (
    <section aria-labelledby="following-panel-title" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2
          id="following-panel-title"
          className="text-[11px] font-normal uppercase tracking-[0.08em] text-muted"
        >
          Siguiendo
        </h2>
        {hasMore && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="text-xs font-medium text-primary hover:underline"
          >
            Ver todos
          </button>
        )}
      </div>

      {status === "loading" && (
        <div aria-hidden="true" className="flex flex-col gap-3">
          {[0, 1, 2].map((n) => (
            <div key={n} className="flex items-center gap-2.5">
              <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-surface" />
              <div className="flex flex-col gap-1.5">
                <div className="h-3 w-24 animate-pulse rounded bg-surface" />
                <div className="h-2.5 w-16 animate-pulse rounded bg-surface" />
              </div>
            </div>
          ))}
        </div>
      )}

      {status === "error" && (
        <p className="text-sm text-muted">No se pudo cargar la lista.</p>
      )}

      {status === "ready" && items.length === 0 && (
        <p className="text-sm text-muted">
          Todavía no sigues a nadie. Busca personas desde la barra superior.
        </p>
      )}

      {status === "ready" && items.length > 0 && (
        <ul className="flex flex-col">
          {items.map((user) => {
            const name = user.displayName ?? user.username;
            return (
              <li key={user.id}>
                <Link
                  href={`/u/${user.username}`}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface"
                >
                  <Avatar
                    name={name}
                    avatarPublicId={user.avatarPublicId}
                    size="sm"
                  />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold">
                      {name}
                    </span>
                    <span className="truncate text-xs text-muted">
                      @{user.username}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {showAll && (
        <FollowListModal
          username={username}
          kind="following"
          onClose={() => setShowAll(false)}
        />
      )}
    </section>
  );
}
