"use client";

import { useEffect, useId, useState } from "react";
import type { CommentDto } from "@red/api-types";
import { apiFetchClient } from "@/lib/api-client";
import { EmojiPicker, EmojiToggleButton } from "@/components/emoji-picker";
import { ApiError } from "@/lib/api-error";
import { useEmojiInsert } from "@/lib/use-emoji-insert";

// Mismo límite que la api y que CommentSection (RN07).
const MAX_CONTENT_LENGTH = 1000;

/**
 * Recuadro para comentar sin salir del feed: se abre debajo de la publicación al
 * tocar el 💬 de PostCard. Envía con POST /api/posts/:id/comments; el contador en
 * vivo (S3-18) se actualiza solo por el socket, así que aquí no se suma nada.
 * Con `parentId` responde ese comentario (S4-14): lo usa CommentSection en /p/[id], con
 * `initialContent` "@usuario " al responder una respuesta.
 */
export function QuickCommentBox({
  postId,
  parentId,
  initialContent = "",
  label = "Escribe un comentario",
  onPosted,
  onClose,
}: {
  postId: string;
  parentId?: string;
  initialContent?: string;
  label?: string;
  onPosted: (comment: CommentDto) => void;
  onClose: () => void;
}) {
  const [content, setContent] = useState(initialContent);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const { ref: textareaRef, insert: insertEmoji } =
    useEmojiInsert<HTMLTextAreaElement>(content, setContent, MAX_CONTENT_LENGTH);
  const pickerId = useId();
  const inputId = `quick-comment-${parentId ?? postId}`;
  const canSubmit = !submitting && content.trim().length > 0;

  // textareaRef es el mismo objeto en cada render: esto corre una sola vez, al abrir
  // Con "@usuario " precargado, el cursor queda al final para seguir escribiendo
  useEffect(() => {
    const field = textareaRef.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }, [textareaRef]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const comment = await apiFetchClient<CommentDto>(
        `/api/posts/${postId}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parentId ? { content, parentId } : { content }),
        },
      );
      setContent("");
      setEmojiOpen(false);
      onPosted(comment);
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.details.some((detail) => detail.field === "parentId")
      ) {
        setError("Ese comentario ya no existe.");
      } else if (err instanceof ApiError && err.statusCode === 400) {
        setError("El comentario debe tener entre 1 y 1000 caracteres.");
      } else if (err instanceof ApiError && err.statusCode === 404) {
        setError("Esta publicación ya no existe.");
      } else if (err instanceof ApiError && err.statusCode === 429) {
        setError("Demasiados intentos. Espera un momento.");
      } else {
        setError("No se pudo comentar. Intenta de nuevo.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        // Con el panel de emojis abierto, Escape solo cierra el panel
        if (emojiOpen) setEmojiOpen(false);
        else onClose();
      }}
      className="quick-comment-box flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 focus-within:border-primary"
    >
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <textarea
        ref={textareaRef}
        id={inputId}
        value={content}
        onChange={(event) => {
          setContent(event.target.value);
          setError(null);
        }}
        maxLength={MAX_CONTENT_LENGTH}
        rows={2}
        placeholder={`${label}…`}
        aria-invalid={error !== null}
        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-primary"
      />
      {emojiOpen && (
        <EmojiPicker
          id={pickerId}
          onPick={(emoji) => {
            insertEmoji(emoji);
            setError(null);
          }}
          onClose={() => setEmojiOpen(false)}
          className="rounded-xl border border-border p-2.5 sm:w-[328px]"
        />
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <EmojiToggleButton
            open={emojiOpen}
            onToggle={() => setEmojiOpen((open) => !open)}
            controls={pickerId}
            className="h-9 w-9"
          />
          <span className="text-xs text-muted tabular-nums">
            {content.length} / {MAX_CONTENT_LENGTH}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-background disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-action px-4 py-1.5 text-sm font-medium text-white hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Enviando…" : "Enviar"}
          </button>
        </div>
      </div>
    </form>
  );
}
