"use client";

import { useEffect, useRef, useState } from "react";
import type { MeDto, PostDto, PostPageDto } from "@red/api-types";
import { PostCard } from "@/components/post-card";
import { PostComposer } from "@/components/post-composer";
import { apiFetchClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";

type Tab = "siguiendo" | "explorar";

type TabState = {
  items: PostDto[];
  nextCursor: string | null;
  status: "idle" | "loading" | "loading-more" | "error" | "ready";
  error: string | null;
};

const INITIAL_TAB_STATE: TabState = {
  items: [],
  nextCursor: null,
  status: "idle",
  error: null,
};

const INITIAL_TABS: Record<Tab, TabState> = {
  siguiendo: INITIAL_TAB_STATE,
  explorar: INITIAL_TAB_STATE,
};

function pathFor(tab: Tab): string {
  return tab === "siguiendo" ? "/api/feed" : "/api/feed/explore";
}

function fetchPage(tab: Tab, cursor: string | null): Promise<PostPageDto> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return apiFetchClient<PostPageDto>(`${pathFor(tab)}${query}`);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export default function FeedPage() {
  const [tab, setTab] = useState<Tab>("explorar");
  const [reloadToken, setReloadToken] = useState(0);
  const [tabs, setTabs] = useState<Record<Tab, TabState>>(INITIAL_TABS);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(
    undefined,
  );
  const current = tabs[tab];

  // Qué pestaña ya se pidió para cada reloadToken: evita volver a pedirla solo por
  // cambiar de pestaña y regresar. El efecto no depende de current.status (si lo
  // pusiera en las dependencias, el propio efecto lo cambiaría y se cancelaría a
  // sí mismo antes de que la petición terminara).
  const fetchedRef = useRef<Record<Tab, number>>({
    siguiendo: -1,
    explorar: -1,
  });

  // Carga la pestaña activa la primera vez que se muestra (o de nuevo tras publicar).
  useEffect(() => {
    if (fetchedRef.current[tab] === reloadToken) return;
    fetchedRef.current[tab] = reloadToken;
    let cancelled = false;

    setTabs((prev) => ({
      ...prev,
      [tab]: { ...INITIAL_TAB_STATE, status: "loading" },
    }));

    fetchPage(tab, null)
      .then((page) => {
        if (cancelled) return;
        setTabs((prev) => ({
          ...prev,
          [tab]: {
            items: page.items,
            nextCursor: page.nextCursor,
            status: "ready",
            error: null,
          },
        }));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setTabs((prev) => ({
          ...prev,
          [tab]: {
            ...prev[tab],
            status: "error",
            error: errorMessage(error, "No se pudo cargar el feed."),
          },
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [tab, reloadToken]);

  // Para saber qué publicaciones son propias (botón de eliminar). Si falla, simplemente
  // no se muestra ningún botón de eliminar: no es crítico para ver el feed.
  useEffect(() => {
    apiFetchClient<MeDto>("/api/auth/me")
      .then((me) => setCurrentUserId(me.id))
      .catch(() => {});
  }, []);

  async function loadMore() {
    if (!current.nextCursor || current.status === "loading-more") return;
    setTabs((prev) => ({
      ...prev,
      [tab]: { ...prev[tab], status: "loading-more" },
    }));
    try {
      const page = await fetchPage(tab, current.nextCursor);
      setTabs((prev) => ({
        ...prev,
        [tab]: {
          items: [...prev[tab].items, ...page.items],
          nextCursor: page.nextCursor,
          status: "ready",
          error: null,
        },
      }));
    } catch (error) {
      setTabs((prev) => ({
        ...prev,
        [tab]: {
          ...prev[tab],
          status: "error",
          error: errorMessage(error, "No se pudo cargar más publicaciones."),
        },
      }));
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4">
      <PostComposer
        onPosted={() => {
          // Vuelve a pedir el feed desde el principio: hay una publicación nueva.
          setReloadToken((n) => n + 1);
        }}
      />

      <div className="sticky top-14 flex border-b border-border bg-background">
        <button
          type="button"
          onClick={() => setTab("siguiendo")}
          className={`flex-1 border-b-2 py-3 text-sm font-semibold ${
            tab === "siguiendo"
              ? "border-primary text-primary"
              : "border-transparent text-muted"
          }`}
        >
          Siguiendo
        </button>
        <button
          type="button"
          onClick={() => setTab("explorar")}
          className={`flex-1 border-b-2 py-3 text-sm font-semibold ${
            tab === "explorar"
              ? "border-primary text-primary"
              : "border-transparent text-muted"
          }`}
        >
          Explorar
        </button>
      </div>

      {current.status === "loading" && (
        <p className="py-10 text-center text-muted">Cargando…</p>
      )}

      {current.status === "error" && current.items.length === 0 && (
        <p className="py-10 text-center text-red-600">{current.error}</p>
      )}

      {current.status === "ready" &&
        current.items.length === 0 &&
        (tab === "siguiendo" ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-muted">
              Aún no sigues a nadie. Explora publicaciones o busca personas
              desde la barra superior para empezar a seguirlas.
            </p>
            <button
              type="button"
              onClick={() => setTab("explorar")}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
            >
              Ir a Explorar
            </button>
          </div>
        ) : (
          <p className="py-10 text-center text-muted">
            Aún no hay publicaciones.
          </p>
        ))}

      {current.items.length > 0 && (
        <>
          <div className="flex flex-col">
            {current.items.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUserId={currentUserId}
              />
            ))}
          </div>

          {current.nextCursor && (
            <div className="flex justify-center py-6">
              <button
                type="button"
                onClick={loadMore}
                disabled={current.status === "loading-more"}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface disabled:opacity-50"
              >
                {current.status === "loading-more"
                  ? "Cargando…"
                  : "Cargar más"}
              </button>
            </div>
          )}

          {current.status === "error" && (
            <p className="pb-6 text-center text-sm text-red-600">
              {current.error}
            </p>
          )}
        </>
      )}
    </main>
  );
}
