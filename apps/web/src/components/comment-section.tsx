"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CommentDto, CommentPageDto } from "@red/api-types";
import { Avatar } from "@/components/avatar";
import { apiFetchClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";
import { fieldErrorsFromDetails } from "@/lib/api-field-errors";
import { formatRelativeTime } from "@/lib/format";
import { subscribePostComments } from "@/lib/socket";

// Tope de páginas por resincronización silenciosa (S3-08): una conversación real no debería
// acercarse a esto; es solo para no reintentar sin fin si algo queda inconsistente.
const MAX_RESYNC_PAGES = 50;

const MAX_CONTENT_LENGTH = 1000;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function CommentRow({
  comment,
  isMine,
  onDeleted,
}: {
  comment: CommentDto;
  isMine: boolean;
  onDeleted: (id: string) => void;
}) {
  const [stage, setStage] = useState<"idle" | "confirming" | "deleting">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const authorName = comment.author.displayName ?? comment.author.username;

  async function confirmDelete() {
    setStage("deleting");
    setError(null);
    try {
      await apiFetchClient<void>(`/api/comments/${comment.id}`, {
        method: "DELETE",
      });
      onDeleted(comment.id);
    } catch (err) {
      setError(errorMessage(err, "No se pudo eliminar. Intenta de nuevo."));
      setStage("confirming");
    }
  }

  return (
    <li className="flex items-start gap-3 py-4">
      <Link href={`/u/${comment.author.username}`} className="shrink-0">
        <Avatar
          name={authorName}
          avatarPublicId={comment.author.avatarPublicId}
          size="sm"
        />
      </Link>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/u/${comment.author.username}`}
            className="text-sm font-semibold hover:underline"
          >
            {authorName}
          </Link>
          <span className="text-xs text-muted">
            {formatRelativeTime(comment.createdAt)}
          </span>
        </div>
        <p className="whitespace-pre-line text-sm">{comment.content}</p>

        {stage !== "idle" && (
          <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-sm">
            <span>¿Eliminar este comentario?</span>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={stage === "deleting"}
              className="font-semibold text-red-600 disabled:opacity-50"
            >
              {stage === "deleting" ? "Eliminando…" : "Sí, eliminar"}
            </button>
            <button
              type="button"
              onClick={() => setStage("idle")}
              disabled={stage === "deleting"}
              className="text-muted hover:underline disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        )}
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>

      {isMine && stage === "idle" && (
        <button
          type="button"
          onClick={() => setStage("confirming")}
          className="text-xs text-muted hover:text-red-600"
        >
          Eliminar
        </button>
      )}
    </li>
  );
}

/**
 * Lista de comentarios de /p/[id] (S3-08): paginada por cursor, del más antiguo al más
 * reciente. El contador en vivo (💬, S3-18) vive en PostCard, no aquí: crear o borrar
 * un comentario llega solo por el socket a quien mira esa publicación.
 */
export function CommentSection({
  postId,
  initialComments,
  currentUserId,
}: {
  postId: string;
  initialComments: CommentPageDto;
  currentUserId?: string;
}) {
  const [items, setItems] = useState<CommentDto[]>(initialComments.items);
  const [nextCursor, setNextCursor] = useState(initialComments.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  const remaining = MAX_CONTENT_LENGTH - content.length;
  const canSubmit = !submitting && content.trim().length > 0;

  // Para leer el estado más reciente desde el listener del socket sin tener que
  // resuscribirlo en cada cambio (eso cortaría y volvería a abrir la sala sin necesidad).
  const itemsRef = useRef(items);
  const nextCursorRef = useRef(nextCursor);
  const resyncingRef = useRef(false);
  useEffect(() => {
    itemsRef.current = items;
    nextCursorRef.current = nextCursor;
  }, [items, nextCursor]);

  // S3-08: si ya llegaste al final de los comentarios (nextCursor null) y alguien más
  // comenta o borra mientras estás viendo la publicación, lo trae sin que recargues.
  // Si todavía te falta "Cargar más", no toca nada: no le va a quitar el control de la
  // paginación al usuario solo porque llegó un comentario nuevo más adelante.
  useEffect(() => {
    return subscribePostComments(postId, (commentCount) => {
      if (nextCursorRef.current !== null) return;
      if (commentCount === itemsRef.current.length) return;
      void resync();
    });

    async function resync() {
      if (resyncingRef.current) return;
      resyncingRef.current = true;
      try {
        let cursor: string | null = null;
        const all: CommentDto[] = [];
        for (let i = 0; i < MAX_RESYNC_PAGES; i++) {
          const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
          const result: CommentPageDto = await apiFetchClient<CommentPageDto>(
            `/api/posts/${postId}/comments${query}`,
          );
          all.push(...result.items);
          if (!result.nextCursor) break;
          cursor = result.nextCursor;
        }
        setItems(all);
        setNextCursor(null);
      } catch {
        // Silencioso: el contador en vivo de PostCard ya avisó del cambio; si esto
        // falla, el usuario sigue viendo su lista hasta que recargue o vuelva a intentar.
      } finally {
        resyncingRef.current = false;
      }
    }
  }, [postId]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const page = await apiFetchClient<CommentPageDto>(
        `/api/posts/${postId}/comments?cursor=${encodeURIComponent(nextCursor)}`,
      );
      setItems((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (error) {
      setLoadMoreError(
        errorMessage(error, "No se pudo cargar más comentarios."),
      );
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setFieldErrors({});
    setGeneralError(null);
    try {
      const comment = await apiFetchClient<CommentDto>(
        `/api/posts/${postId}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        },
      );
      setItems((prev) => [...prev, comment]);
      setContent("");
    } catch (error) {
      if (error instanceof ApiError && error.details.length > 0) {
        setFieldErrors(fieldErrorsFromDetails(error.details));
      } else {
        setGeneralError(
          errorMessage(error, "No se pudo comentar. Intenta de nuevo."),
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleDeleted(id: string) {
    setItems((prev) => prev.filter((comment) => comment.id !== id));
  }

  return (
    <section>
      <form
        noValidate
        onSubmit={handleSubmit}
        className="flex flex-col gap-2 border-b border-border py-4"
      >
        <label htmlFor="comment-content" className="sr-only">
          Escribe un comentario
        </label>
        <textarea
          id="comment-content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={MAX_CONTENT_LENGTH}
          rows={2}
          placeholder="Escribe un comentario…"
          aria-invalid={fieldErrors.content !== undefined}
          className="resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-primary"
        />
        {fieldErrors.content && (
          <p className="text-sm text-red-600">{fieldErrors.content}</p>
        )}
        {generalError && (
          <p className="text-sm text-red-600">{generalError}</p>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">
            {remaining} caracteres restantes
          </span>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Comentando…" : "Comentar"}
          </button>
        </div>
      </form>

      {items.length === 0 ? (
        <p className="py-10 text-center text-muted">
          Aún no hay comentarios. Sé el primero en comentar.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {items.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              isMine={currentUserId === comment.author.id}
              onDeleted={handleDeleted}
            />
          ))}
        </ul>
      )}

      {nextCursor && (
        <div className="flex justify-center py-6">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface disabled:opacity-50"
          >
            {loadingMore ? "Cargando…" : "Cargar más"}
          </button>
        </div>
      )}
      {loadMoreError && (
        <p className="pb-6 text-center text-sm text-red-600">
          {loadMoreError}
        </p>
      )}
    </section>
  );
}
