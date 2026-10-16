"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/components/avatar";

type Comment = {
  id: string;
  authorName: string;
  authorUsername: string;
  content: string;
  createdAtLabel: string;
  isMine: boolean;
};

const INITIAL_COMMENTS: Comment[] = [
  {
    id: "c1",
    authorName: "Carlos Pérez",
    authorUsername: "carlosp",
    content: "Qué buena foto, ¿dónde la tomaste?",
    createdAtLabel: "hace 1 h",
    isMine: false,
  },
  {
    id: "c2",
    authorName: "Tú",
    authorUsername: "yo",
    content: "Gracias! Fue en el mirador del parque.",
    createdAtLabel: "hace 40 min",
    isMine: true,
  },
];

const COMMENT_MAX = 1000;

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [comments, setComments] = useState<Comment[]>(INITIAL_COMMENTS);
  const [draft, setDraft] = useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;

    setComments((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        authorName: "Tú",
        authorUsername: "yo",
        content,
        createdAtLabel: "justo ahora",
        isMine: true,
      },
    ]);
    setDraft("");
  }

  function handleDelete(commentId: string) {
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  }

  return (
    <main className="mx-auto max-w-xl px-4">
      <article className="flex flex-col gap-3 border-b border-border py-4">
        <div className="flex items-center gap-3">
          <Avatar name="Ana García" size="sm" />
          <div className="flex flex-col">
            <Link href="/u/ana_garcia" className="text-sm font-semibold hover:underline">
              Ana García
            </Link>
            <span className="text-xs text-muted">@ana_garcia · hace 2 h</span>
          </div>
        </div>

        <p className="whitespace-pre-line">
          Primer atardecer del semestre, valió la pena madrugar por esta
          foto. (publicación {id})
        </p>

        <div className="aspect-video rounded-md bg-surface" aria-hidden />

        <div className="flex gap-6 text-sm text-muted">
          <span>❤ 24</span>
          <span>💬 {comments.length}</span>
        </div>
      </article>

      <section className="flex flex-col divide-y divide-border">
        {comments.length === 0 ? (
          <p className="py-10 text-center text-muted">
            Aún no hay comentarios. Sé el primero en comentar.
          </p>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="flex items-start gap-3 py-4">
              <Avatar name={comment.authorName} size="sm" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">
                    {comment.authorName}
                  </span>
                  <span className="text-xs text-muted">
                    {comment.createdAtLabel}
                  </span>
                </div>
                <p className="text-sm">{comment.content}</p>
              </div>
              {comment.isMine && (
                <button
                  type="button"
                  onClick={() => handleDelete(comment.id)}
                  aria-label="Borrar comentario"
                  className="text-xs text-muted hover:text-primary"
                >
                  Borrar
                </button>
              )}
            </div>
          ))
        )}
      </section>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 py-4">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={COMMENT_MAX}
          rows={2}
          placeholder="Escribe un comentario..."
          className="resize-none rounded-md border border-border px-3 py-2 outline-primary"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">
            {draft.length}/{COMMENT_MAX}
          </span>
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-hover"
          >
            Comentar
          </button>
        </div>
      </form>
    </main>
  );
}
