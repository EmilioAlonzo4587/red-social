"use client";

import { useState } from "react";
import { PostCard, type Post } from "@/components/post-card";

const EXPLORAR_POSTS: Post[] = [
  {
    id: "1",
    authorName: "Ana García",
    authorUsername: "ana_garcia",
    content: "Primer atardecer del semestre, valió la pena madrugar por esta foto.",
    mediaCount: 1,
    likeCount: 24,
    commentCount: 5,
    createdAtLabel: "hace 2 h",
  },
  {
    id: "2",
    authorName: "Carlos Pérez",
    authorUsername: "carlosp",
    content:
      "Terminé mi proyecto de base de datos. Índices, CHECK y paginación por cursor, nada de OFFSET.",
    mediaCount: 0,
    likeCount: 12,
    commentCount: 3,
    createdAtLabel: "hace 5 h",
  },
  {
    id: "3",
    authorName: "Luisa Méndez",
    authorUsername: "luisamendez",
    content: "Fin de semana de senderismo con el equipo 🏔️",
    mediaCount: 3,
    likeCount: 41,
    commentCount: 8,
    createdAtLabel: "ayer",
  },
];

const SIGUIENDO_POSTS: Post[] = [];

type Tab = "siguiendo" | "explorar";

export default function FeedPage() {
  const [tab, setTab] = useState<Tab>("explorar");
  const posts = tab === "siguiendo" ? SIGUIENDO_POSTS : EXPLORAR_POSTS;

  return (
    <main className="mx-auto max-w-xl px-4">
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

      {posts.length === 0 ? (
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
        <>
          <div className="flex flex-col">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
          <div className="flex justify-center py-6">
            <button
              type="button"
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface"
            >
              Cargar más
            </button>
          </div>
        </>
      )}
    </main>
  );
}
