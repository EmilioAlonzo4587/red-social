"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { CommentDto, CommentPageDto } from "@red/api-types";
import { Avatar } from "@/components/avatar";
import { EmojiPicker, EmojiToggleButton } from "@/components/emoji-picker";
import { QuickCommentBox } from "@/components/quick-comment-box";
import { apiFetchClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";
import { fieldErrorsFromDetails } from "@/lib/api-field-errors";
import { formatRelativeTime } from "@/lib/format";
import { subscribePostComments } from "@/lib/socket";
import { useEmojiInsert } from "@/lib/use-emoji-insert";

// Ya dentro del detalle, el 💬 de PostCard llama a focusCommentInput() para llevar
// al cuadro de comentario de esta sección.
export const COMMENT_INPUT_ID = "comment-content";

export function focusCommentInput(): boolean {
  const input = document.getElementById(COMMENT_INPUT_ID);
  if (!input) return false;
  input.scrollIntoView({ block: "center" });
  input.focus({ preventScroll: true });
  return true;
}

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
  onReply,
}: {
  comment: CommentDto;
  isMine: boolean;
  onDeleted: (comment: CommentDto) => void;
  onReply?: () => void;
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
      onDeleted(comment);
    } catch (err) {
      setError(errorMessage(err, "No se pudo eliminar. Intenta de nuevo."));
      setStage("confirming");
    }
  }

  // S4-14: un comentario eliminado que todavía tiene respuestas queda como cabeza del hilo
  if (comment.deleted) {
    return (
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="h-8 w-8 shrink-0 rounded-full border border-dashed border-border"
        />
        <p className="py-1.5 text-sm italic text-muted">Comentario eliminado</p>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      {/* Mismo destino que el nombre de al lado: fuera del Tab y del lector de
          pantalla para no repetirlo, pero se puede tocar (S4-06). */}
      <Link
        href={`/u/${comment.author.username}`}
        tabIndex={-1}
        aria-hidden="true"
        className="shrink-0"
      >
        <Avatar
          name={authorName}
          avatarPublicId={comment.author.avatarPublicId}
          size="sm"
        />
      </Link>
      <div className="min-w-0 flex-1">
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
        <p className="whitespace-pre-line text-sm [overflow-wrap:anywhere]">
          {comment.content}
        </p>

        {onReply && stage === "idle" && (
          <button
            type="button"
            onClick={onReply}
            aria-label={`Responder a ${authorName}`}
            className="tap-area mt-1 text-xs font-semibold text-muted hover:text-primary"
          >
            Responder
          </button>
        )}

        {stage !== "idle" && (
          <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-sm">
            <span>¿Eliminar este comentario?</span>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={stage === "deleting"}
              className="font-semibold text-danger disabled:opacity-50"
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
        {error && <p className="mt-1 text-sm text-danger">{error}</p>}
      </div>

      {isMine && stage === "idle" && (
        <button
          type="button"
          onClick={() => setStage("confirming")}
          className="tap-area text-xs text-muted hover:text-danger"
        >
          Eliminar
        </button>
      )}
    </div>
  );
}

function repliesLabel(count: number): string {
  return count === 1 ? "Ver 1 respuesta" : `Ver ${count} respuestas`;
}

/**
 * Un comentario de primer nivel con sus respuestas (S4-14, un solo nivel). Las respuestas
 * se piden al abrir el hilo (GET /api/comments/:id/replies) y se vuelven a pedir si su
 * cantidad cambia mientras está abierto (el contador en vivo resincroniza la lista).
 */
function CommentThread({
  postId,
  comment,
  currentUserId,
  onChanged,
}: {
  postId: string;
  comment: CommentDto;
  currentUserId?: string;
  onChanged: (comment: CommentDto | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState<CommentDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [replyBox, setReplyBox] = useState<{ initial: string } | null>(null);
  const loadedForRef = useRef<number | null>(null);

  const loadReplies = useCallback(async (fromCursor: string | null) => {
    setStatus("loading");
    try {
      const query = fromCursor ? `?cursor=${encodeURIComponent(fromCursor)}` : "";
      const page = await apiFetchClient<CommentPageDto>(
        `/api/comments/${comment.id}/replies${query}`,
      );
      setReplies((prev) => (fromCursor ? [...prev, ...page.items] : page.items));
      setCursor(page.nextCursor);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }, [comment.id]);

  // Abierto: si llegan respuestas nuevas de otros (replyCount cambia), se recargan
  useEffect(() => {
    if (!open || loadedForRef.current === comment.replyCount) return;
    loadedForRef.current = comment.replyCount;
    void loadReplies(null);
  }, [open, comment.replyCount, loadReplies]);

  function handleReplyPosted(reply: CommentDto) {
    setReplyBox(null);
    setOpen(true);
    setReplies((prev) => [...prev, reply]);
    loadedForRef.current = comment.replyCount + 1;
    onChanged({ ...comment, replyCount: comment.replyCount + 1 });
  }

  function handleReplyDeleted(reply: CommentDto) {
    setReplies((prev) => prev.filter((item) => item.id !== reply.id));
    const replyCount = Math.max(0, comment.replyCount - 1);
    loadedForRef.current = replyCount;
    // Un comentario eliminado sin respuestas ya no tiene nada que mostrar
    onChanged(comment.deleted && replyCount === 0 ? null : { ...comment, replyCount });
  }

  function handleDeleted() {
    // Con respuestas, el hilo sigue con "Comentario eliminado"; sin ellas, desaparece
    onChanged(
      comment.replyCount > 0
        ? { ...comment, deleted: true, content: null }
        : null,
    );
  }

  return (
    <li className="flex flex-col gap-2 py-4">
      <CommentRow
        comment={comment}
        isMine={currentUserId === comment.author.id}
        onDeleted={handleDeleted}
        onReply={() => setReplyBox({ initial: "" })}
      />

      {comment.replyCount > 0 && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          className="tap-area ml-11 self-start text-xs font-semibold text-primary hover:underline"
        >
          {repliesLabel(comment.replyCount)}
        </button>
      )}

      {open && (
        <div className="ml-11 flex flex-col gap-3 border-l-2 border-border pl-3">
          <ul className="flex flex-col gap-3" aria-label="Respuestas">
            {replies.map((reply) => (
              <li key={reply.id}>
                <CommentRow
                  comment={reply}
                  isMine={currentUserId === reply.author.id}
                  onDeleted={handleReplyDeleted}
                  onReply={() =>
                    setReplyBox({ initial: `@${reply.author.username} ` })
                  }
                />
              </li>
            ))}
          </ul>
          {status === "loading" && (
            <p className="text-xs text-muted">Cargando respuestas…</p>
          )}
          {status === "error" && (
            <p className="text-xs text-danger">
              No se pudieron cargar las respuestas.
            </p>
          )}
          <div className="flex gap-4">
            {cursor && status !== "loading" && (
              <button
                type="button"
                onClick={() => void loadReplies(cursor)}
                className="tap-area text-xs font-semibold text-primary hover:underline"
              >
                Cargar más respuestas
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-expanded={true}
              className="tap-area text-xs font-semibold text-muted hover:underline"
            >
              Ocultar respuestas
            </button>
          </div>
        </div>
      )}

      {replyBox && (
        <div className="ml-11">
          <QuickCommentBox
            key={replyBox.initial}
            postId={postId}
            parentId={comment.id}
            initialContent={replyBox.initial}
            label="Escribe una respuesta"
            onPosted={handleReplyPosted}
            onClose={() => setReplyBox(null)}
          />
        </div>
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

  const [emojiOpen, setEmojiOpen] = useState(false);
  const { ref: textareaRef, insert: insertEmoji } =
    useEmojiInsert<HTMLTextAreaElement>(content, setContent, MAX_CONTENT_LENGTH);
  const pickerId = useId();
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
      // commentCount cuenta también las respuestas (S4-14); los eliminados no cuentan
      const shown = itemsRef.current.reduce(
        (total, item) => total + (item.deleted ? 0 : 1) + item.replyCount,
        0,
      );
      if (commentCount === shown) return;
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
      setEmojiOpen(false);
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

  // Un hilo cambió (respuestas nuevas o borradas, o se eliminó su comentario); null lo quita
  function handleThreadChanged(id: string, updated: CommentDto | null) {
    setItems((prev) =>
      updated
        ? prev.map((comment) => (comment.id === id ? updated : comment))
        : prev.filter((comment) => comment.id !== id),
    );
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
          ref={textareaRef}
          id={COMMENT_INPUT_ID}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={MAX_CONTENT_LENGTH}
          rows={2}
          placeholder="Escribe un comentario…"
          aria-invalid={fieldErrors.content !== undefined}
          onKeyDown={(event) => {
            if (event.key === "Escape") setEmojiOpen(false);
          }}
          className="resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-primary"
        />
        {emojiOpen && (
          <EmojiPicker
            id={pickerId}
            onPick={insertEmoji}
            onClose={() => setEmojiOpen(false)}
            className="rounded-xl border border-border p-2.5 sm:w-[328px]"
          />
        )}
        {fieldErrors.content && (
          <p className="text-sm text-danger">{fieldErrors.content}</p>
        )}
        {generalError && (
          <p className="text-sm text-danger">{generalError}</p>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <EmojiToggleButton
              open={emojiOpen}
              onToggle={() => setEmojiOpen((open) => !open)}
              controls={pickerId}
              className="h-9 w-9"
            />
            <span className="text-xs text-muted">
              {remaining} caracteres restantes
            </span>
          </div>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-action px-4 py-1.5 text-sm font-medium text-white hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50"
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
            <CommentThread
              key={comment.id}
              postId={postId}
              comment={comment}
              currentUserId={currentUserId}
              onChanged={(updated) => handleThreadChanged(comment.id, updated)}
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
        <p className="pb-6 text-center text-sm text-danger">
          {loadMoreError}
        </p>
      )}
    </section>
  );
}
