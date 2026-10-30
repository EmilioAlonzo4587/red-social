"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { UserSummaryDto } from "@red/api-types";
import { Avatar } from "@/components/avatar";
import { apiFetchClient } from "@/lib/api-client";

// Mismos límites que GET /api/users/search (RN14): al menos 2 caracteres sin contar
// los espacios y como máximo 80, el largo de un nombre visible.
const MIN_LENGTH = 2;
const MAX_LENGTH = 80;
// Espera entre teclas antes de pedir resultados (S3-09)
export const SEARCH_DEBOUNCE_MS = 300;

type Status = "idle" | "loading" | "ready" | "error";

export function UserSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSummaryDto[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const term = query.trim();

  useEffect(() => {
    if (term.length < MIN_LENGTH) return;
    // cancelled: si el usuario siguió escribiendo, la respuesta de una búsqueda vieja
    // no pisa la de la nueva aunque llegue después.
    let cancelled = false;
    const timer = setTimeout(() => {
      apiFetchClient<UserSummaryDto[]>(
        `/api/users/search?q=${encodeURIComponent(term)}`,
      )
        .then((users) => {
          if (cancelled) return;
          setResults(users);
          setStatus("ready");
        })
        .catch(() => {
          if (!cancelled) setStatus("error");
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term]);

  // Cierra la lista al hacer click fuera del buscador
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function handleChange(value: string) {
    setQuery(value);
    setOpen(true);
    const next = value.trim();
    if (next === term) return;
    if (next.length < MIN_LENGTH) {
      setResults([]);
      setStatus("idle");
    } else {
      setStatus("loading");
    }
  }

  function close() {
    setOpen(false);
    setQuery("");
    setResults([]);
    setStatus("idle");
  }

  const showPanel = open && term.length >= MIN_LENGTH;

  return (
    <div
      ref={containerRef}
      className="relative ml-auto w-full max-w-[360px]"
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <input
        type="search"
        value={query}
        onChange={(event) => handleChange(event.target.value)}
        onFocus={() => setOpen(true)}
        maxLength={MAX_LENGTH}
        placeholder="Buscar personas..."
        aria-label="Buscar personas"
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-primary placeholder:text-muted"
      />

      {showPanel && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-96 overflow-y-auto rounded-xl border border-border bg-background shadow-lg">
          {status === "loading" && (
            <p className="px-4 py-3 text-sm text-muted">Buscando…</p>
          )}

          {status === "error" && (
            <p className="px-4 py-3 text-sm text-red-600">
              No se pudo buscar. Intenta de nuevo.
            </p>
          )}

          {status === "ready" && results.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted">
              Nadie coincide con “{term}”.
            </p>
          )}

          {status === "ready" && results.length > 0 && (
            <ul aria-label="Resultados de búsqueda">
              {results.map((user) => {
                const name = user.displayName ?? user.username;
                return (
                  <li key={user.id}>
                    <Link
                      href={`/u/${encodeURIComponent(user.username)}`}
                      onClick={close}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-surface"
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
        </div>
      )}
    </div>
  );
}
