"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
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

function profileHref(user: UserSummaryDto): string {
  return `/u/${encodeURIComponent(user.username)}`;
}

// Combobox (S4-16): el foco se queda en el campo y las flechas mueven la opción activa,
// que se anuncia con aria-activedescendant; Enter entra a su perfil.
export function UserSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSummaryDto[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [open, setOpen] = useState(false);
  // -1: ninguna elegida todavía
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const optionId = (index: number) => `${listId}-${index}`;
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
          setActiveIndex(-1);
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
    setActiveIndex(-1);
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
    setActiveIndex(-1);
    setStatus("idle");
  }

  const showPanel = open && term.length >= MIN_LENGTH;
  const hasResults = status === "ready" && results.length > 0;
  const listVisible = showPanel && hasResults;

  function moveTo(index: number) {
    setActiveIndex(index);
    // La opción activa siempre a la vista si la lista tiene scroll
    document
      .getElementById(optionId(index))
      ?.scrollIntoView?.({ block: "nearest" });
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!hasResults) return;
      event.preventDefault();
      if (!open) setOpen(true);
      const last = results.length - 1;
      const next =
        event.key === "ArrowDown"
          ? activeIndex >= last
            ? 0
            : activeIndex + 1
          : activeIndex <= 0
            ? last
            : activeIndex - 1;
      moveTo(next);
    } else if (event.key === "Enter") {
      if (!listVisible) return;
      event.preventDefault();
      // Sin elegir con las flechas, Enter entra al primer resultado
      const chosen = results[activeIndex >= 0 ? activeIndex : 0];
      close();
      router.push(profileHref(chosen));
    }
  }

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
        role="combobox"
        aria-expanded={listVisible}
        aria-controls={listVisible ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={
          listVisible && activeIndex >= 0 ? optionId(activeIndex) : undefined
        }
        value={query}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={handleInputKeyDown}
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
            <p className="px-4 py-3 text-sm text-danger">
              No se pudo buscar. Intenta de nuevo.
            </p>
          )}

          {status === "ready" && results.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted">
              Nadie coincide con “{term}”.
            </p>
          )}

          {status === "ready" && results.length > 0 && (
            <ul id={listId} role="listbox" aria-label="Resultados de búsqueda">
              {results.map((user, index) => {
                const name = user.displayName ?? user.username;
                const active = index === activeIndex;
                return (
                  <li key={user.id} role="none">
                    {/* Sigue siendo un enlace (clic, abrir en otra pestaña), con el rol
                        de opción para el lector de pantalla */}
                    <Link
                      id={optionId(index)}
                      role="option"
                      aria-selected={active}
                      tabIndex={-1}
                      href={profileHref(user)}
                      onClick={close}
                      onMouseMove={() => {
                        if (!active) setActiveIndex(index);
                      }}
                      // Barra verde a la izquierda además del fondo: surface sola casi no
                      // se distingue del blanco
                      className={`flex items-center gap-3 px-4 py-2 ${
                        active
                          ? "bg-surface shadow-[inset_3px_0_0_var(--color-primary)]"
                          : ""
                      }`}
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
