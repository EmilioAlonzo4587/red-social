"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { UserSummaryDto, UserSummaryPageDto } from "@red/api-types";
import { Avatar } from "@/components/avatar";
import { apiFetchClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";

type Kind = "followers" | "following";

type Status = "loading" | "loading-more" | "ready" | "error";

const TITLES: Record<Kind, string> = {
  followers: "Seguidores",
  following: "Seguidos",
};

const EMPTY_MESSAGES: Record<Kind, string> = {
  followers: "Todavía no tiene seguidores.",
  following: "Todavía no sigue a nadie.",
};

function pathFor(username: string, kind: Kind): string {
  return `/api/users/${username}/${kind}`;
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "No se pudo cargar la lista.";
}

export function FollowListModal({
  username,
  kind,
  onClose,
}: {
  username: string;
  kind: Kind;
  onClose: () => void;
}) {
  const [items, setItems] = useState<UserSummaryDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Sin reset de estado aquí: ProfileStats monta una instancia nueva por cada
    // kind (key={openList}), así que el estado inicial "loading" ya es correcto.
    apiFetchClient<UserSummaryPageDto>(pathFor(username, kind))
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(errorMessage(err));
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [username, kind]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function loadMore() {
    if (!nextCursor || status === "loading-more") return;
    setStatus("loading-more");
    try {
      const page = await apiFetchClient<UserSummaryPageDto>(
        `${pathFor(username, kind)}?cursor=${encodeURIComponent(nextCursor)}`,
      );
      setItems((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
      setStatus("ready");
    } catch (err) {
      setError(errorMessage(err));
      setStatus("error");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={TITLES[kind]}
      onClick={onClose}
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-sm flex-col rounded-xl bg-background shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-semibold">{TITLES[kind]}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-xl text-muted hover:text-foreground"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {status === "loading" && (
            <p className="py-10 text-center text-muted">Cargando…</p>
          )}

          {status === "error" && items.length === 0 && (
            <p className="py-10 text-center text-red-600">{error}</p>
          )}

          {status !== "loading" &&
            !(status === "error" && items.length === 0) &&
            items.length === 0 && (
              <p className="py-10 text-center text-muted">
                {EMPTY_MESSAGES[kind]}
              </p>
            )}

          {items.map((user) => {
            const name = user.displayName ?? user.username;
            return (
              <Link
                key={user.id}
                href={`/u/${user.username}`}
                onClick={onClose}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface"
              >
                <Avatar
                  name={name}
                  avatarPublicId={user.avatarPublicId}
                  size="sm"
                />
                <div className="flex flex-col">
                  <span className="text-sm font-semibold">{name}</span>
                  <span className="text-xs text-muted">
                    @{user.username}
                  </span>
                </div>
              </Link>
            );
          })}

          {nextCursor && (
            <div className="flex justify-center py-4">
              <button
                type="button"
                onClick={loadMore}
                disabled={status === "loading-more"}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface disabled:opacity-50"
              >
                {status === "loading-more" ? "Cargando…" : "Cargar más"}
              </button>
            </div>
          )}

          {status === "error" && items.length > 0 && (
            <p className="px-4 pb-4 text-center text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
