"use client";

import { useEffect, useRef, useState } from "react";
import type { MeDto, PostDto, PostPageDto, ProfileDto } from "@red/api-types";
import { FollowingPanel } from "@/components/following-panel";
import { HomeProfileCard } from "@/components/home-profile-card";
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
  const [me, setMe] = useState<MeDto | null>(null);
  const [profile, setProfile] = useState<ProfileDto | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const currentUserId = me?.id;
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
    const fetched = fetchedRef.current;
    if (fetched[tab] === reloadToken) return;
    fetched[tab] = reloadToken;
    let cancelled = false;
    let done = false;

    setTabs((prev) => ({
      ...prev,
      [tab]: { ...INITIAL_TAB_STATE, status: "loading" },
    }));

    fetchPage(tab, null)
      .then((page) => {
        done = true;
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
        done = true;
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
      // Si se canceló antes de terminar, su respuesta se descarta: hay que liberar la marca
      // para que la próxima ejecución vuelva a pedir. Pasa siempre en desarrollo, porque
      // Strict Mode monta, limpia y vuelve a montar cada efecto, y también al cambiar de
      // pestaña mientras una carga. Sin esto la pestaña se quedaba en "Cargando…".
      if (!done) fetched[tab] = -1;
    };
  }, [tab, reloadToken]);

  // Para saber qué publicaciones son propias (botón de eliminar) y para la tarjeta de
  // perfil de la columna derecha. Los seguidores/seguidos no vienen en /api/auth/me,
  // así que hace falta un segundo pedido a /api/users/{username} (como el Navbar y el
  // perfil pedían cada uno por su cuenta). Si cualquiera falla, no se muestra la
  // tarjeta ni el botón de eliminar: no es crítico para ver el feed.
  useEffect(() => {
    apiFetchClient<MeDto>("/api/auth/me")
      .then((result) => {
        setMe(result);
        return apiFetchClient<ProfileDto>(`/api/users/${result.username}`);
      })
      .then((result) => setProfile(result))
      .catch(() => {})
      .finally(() => setMeLoading(false));
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
    <div className="flex">
      <main className="mx-auto w-full min-w-0 max-w-2xl flex-1 px-4 py-4 sm:px-6">
        <h1 className="mb-3 text-xl font-bold">Inicio</h1>

        <PostComposer
          onPosted={() => {
            // Vuelve a pedir el feed desde el principio: hay una publicación nueva.
            setReloadToken((n) => n + 1);
          }}
        />

        <div className="sticky top-16 z-10 mt-4 flex gap-[22px] border-b border-border bg-background">
          <button
            type="button"
            onClick={() => setTab("siguiendo")}
            className={`px-0.5 py-2.5 text-sm font-semibold ${
              tab === "siguiendo"
                ? "text-foreground shadow-[inset_0_-2px_0_var(--color-primary)]"
                : "text-muted hover:text-foreground"
            }`}
          >
            Siguiendo
          </button>
          <button
            type="button"
            onClick={() => setTab("explorar")}
            className={`px-0.5 py-2.5 text-sm font-semibold ${
              tab === "explorar"
                ? "text-foreground shadow-[inset_0_-2px_0_var(--color-primary)]"
                : "text-muted hover:text-foreground"
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
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
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
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface disabled:opacity-50"
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

      {/* Columna derecha solo en pantallas anchas, nunca fixed (D10: si se abren los
          paneles de notificaciones/chat, S3-07/S3-06, deben quedar siempre por encima). */}
      <aside className="hidden w-[260px] shrink-0 border-l border-border p-4 lg:block">
        {/* Con la lista de seguidos (hasta 10) la columna puede pasar de la altura de la
            pantalla: tiene su propio scroll en vez de cortarse. */}
        <div className="sticky top-20 flex max-h-[calc(100vh-96px)] flex-col gap-6 overflow-y-auto overflow-x-hidden">
          <HomeProfileCard me={me} profile={profile} loading={meLoading} />
          {me && <FollowingPanel username={me.username} />}
        </div>
      </aside>
    </div>
  );
}
