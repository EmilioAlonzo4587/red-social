"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  LikeStatusDto,
  PostDto,
  ReactionType,
  ReactToPostDto,
  UpdatePostDto,
} from "@red/api-types";
import { Avatar } from "@/components/avatar";
import { focusCommentInput } from "@/components/comment-section";
import { QuickCommentBox } from "@/components/quick-comment-box";
import { ReactionButton } from "@/components/reaction-button";
import { apiFetchClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";
import { formatRelativeTime } from "@/lib/format";
import { cloudinaryImageUrl } from "@/lib/media";
import { reactionInfo } from "@/lib/reactions";
import { subscribePostComments, subscribePostLikes } from "@/lib/socket";

// Mismo límite que POST/PATCH /api/posts (RN03)
const MAX_CONTENT_LENGTH = 2000;

function editErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.statusCode === 400)
      return "El texto puede tener hasta 2000 caracteres y no puede quedar vacío si la publicación no tiene imágenes.";
    if (error.statusCode === 403) return "No tienes permiso.";
    if (error.statusCode === 404) return "Esta publicación ya no existe.";
  }
  return "No se pudo guardar. Intenta de nuevo.";
}

function imageAlt(index: number, total: number, authorName: string): string {
  return total === 1
    ? `Imagen de la publicación de ${authorName}`
    : `Imagen ${index + 1} de ${total} de la publicación de ${authorName}`;
}

export function PostCard({
  post,
  currentUserId,
  linkToDetail = true,
  onDeleted,
}: {
  post: PostDto;
  currentUserId?: string;
  /** false en /p/[id] (S3-08): ya estás ahí, no tiene sentido enlazar a sí misma. */
  linkToDetail?: boolean;
  onDeleted?: () => void;
}) {
  const authorName = post.author.displayName ?? post.author.username;
  const [myReaction, setMyReaction] = useState(post.myReaction);
  const [topReactions, setTopReactions] = useState(post.topReactions);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [commentBoxOpen, setCommentBoxOpen] = useState(false);
  const [commentPosted, setCommentPosted] = useState(false);
  const [liking, setLiking] = useState(false);
  const [deleteStage, setDeleteStage] = useState<
    "idle" | "confirming" | "deleting"
  >("idle");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  // Editar el texto (S4-06): content y editedAt cambian sin recargar la lista
  const [content, setContent] = useState(post.content);
  const [editedAt, setEditedAt] = useState(post.editedAt);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const isOwner = currentUserId !== undefined && post.author.id === currentUserId;

  // S2-03/S3-18: se suscribe a post:{id} mientras la tarjeta está en pantalla y hace unwatch al desmontar
  useEffect(() => {
    if (deleted) return;
    return subscribePostLikes(post.id, (count, top) => {
      setLikeCount(count);
      setTopReactions(top);
    });
  }, [post.id, deleted]);

  useEffect(() => {
    if (deleted) return;
    return subscribePostComments(post.id, setCommentCount);
  }, [post.id, deleted]);

  async function confirmDelete() {
    setDeleteStage("deleting");
    setDeleteError(null);
    try {
      await apiFetchClient<void>(`/api/posts/${post.id}`, {
        method: "DELETE",
      });
      setDeleted(true);
      onDeleted?.();
    } catch {
      setDeleteError("No se pudo eliminar. Intenta de nuevo.");
      setDeleteStage("confirming");
    }
  }

  function startEditing() {
    setDraft(content ?? "");
    setEditError(null);
    setEditing(true);
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setEditError(null);
    try {
      const updated = await apiFetchClient<PostDto>(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft } satisfies UpdatePostDto),
      });
      setContent(updated.content);
      setEditedAt(updated.editedAt);
      setEditing(false);
    } catch (error) {
      setEditError(editErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function changeReaction(next: ReactionType | null) {
    if (liking) return;
    const previous = { myReaction, likeCount, topReactions };

    // Optimista (S2-10): se ve al toque, se corrige si la api falla. Cambiar de reacción no
    // mueve el total; los emojis más usados llegan con la respuesta.
    setMyReaction(next);
    if (previous.myReaction === null) setLikeCount((count) => count + 1);
    if (next === null) setLikeCount((count) => count - 1);
    if (next && topReactions.length === 0) setTopReactions([next]);
    setLiking(true);
    try {
      const result = await apiFetchClient<LikeStatusDto>(
        `/api/posts/${post.id}/like`,
        next
          ? {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reaction: next } satisfies ReactToPostDto),
            }
          : { method: "DELETE" },
      );
      setMyReaction(result.myReaction);
      setLikeCount(result.likeCount);
      setTopReactions(result.topReactions);
    } catch {
      setMyReaction(previous.myReaction);
      setLikeCount(previous.likeCount);
      setTopReactions(previous.topReactions);
    } finally {
      setLiking(false);
    }
  }

  if (deleted) return null;

  const draftTrimmed = draft.trim();
  // Sin imágenes no puede quedar vacía (RN03); sin cambios no hace falta guardar
  const canSave =
    !saving &&
    (draftTrimmed.length > 0 || post.media.length > 0) &&
    draftTrimmed !== (content ?? "");

  const editForm = (
    <form
      noValidate
      onSubmit={saveEdit}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !saving) setEditing(false);
      }}
      className="flex flex-col gap-2"
    >
      <label htmlFor={`edit-post-${post.id}`} className="sr-only">
        Editar el texto de la publicación
      </label>
      <textarea
        id={`edit-post-${post.id}`}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setEditError(null);
        }}
        maxLength={MAX_CONTENT_LENGTH}
        rows={3}
        autoFocus
        aria-invalid={editError !== null}
        className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-base leading-[1.55] outline-primary"
      />
      {editError && <p className="text-sm text-danger">{editError}</p>}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted tabular-nums">
          {draft.length} / {MAX_CONTENT_LENGTH}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-surface disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="rounded-lg bg-action px-4 py-1.5 text-sm font-medium text-white hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </form>
  );

  const mediaGrid = post.media.length > 0 && (
    <div
      className={`mt-1 grid gap-1 ${post.media.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
    >
      {post.media.map((media, index) => (
        <div
          key={media.publicId}
          className="relative aspect-video overflow-hidden rounded-xl bg-surface"
        >
          {/* Antes alt="": el lector de pantalla se saltaba las fotos (S4-06). No
              se sabe qué muestran, pero sí que existen y de quién son. */}
          <Image
            src={cloudinaryImageUrl(media.publicId)}
            alt={imageAlt(index, post.media.length, authorName)}
            fill
            sizes="(max-width: 640px) 100vw, 576px"
            className="object-cover"
          />
        </div>
      ))}
    </div>
  );

  const postBody = (
    <>
      {content && (
        <p className="whitespace-pre-line text-base leading-[1.55] [overflow-wrap:anywhere]">
          {content}
        </p>
      )}

      {mediaGrid}
    </>
  );

  const reactionsLabel = `${likeCount} ${likeCount === 1 ? "reacción" : "reacciones"}${
    topReactions.length > 0
      ? `: ${topReactions.map((type) => reactionInfo(type).label).join(", ")}`
      : ""
  }`;

  const commentLabel = `Comentar (${commentCount} ${commentCount === 1 ? "comentario" : "comentarios"})`;

  return (
    <article className="flex flex-col gap-2.5 border-b border-border py-4">
      <div className="flex items-center gap-3">
        {/* Mismo destino que el nombre de al lado: fuera del Tab y del lector de
            pantalla para no repetirlo, pero se puede tocar (S4-06). */}
        <Link
          href={`/u/${post.author.username}`}
          tabIndex={-1}
          aria-hidden="true"
          className="shrink-0"
        >
          <Avatar
            name={authorName}
            avatarPublicId={post.author.avatarPublicId}
            size="md"
          />
        </Link>
        <div className="flex min-w-0 flex-col">
          <Link
            href={`/u/${post.author.username}`}
            className="text-sm font-semibold hover:underline"
          >
            {authorName}
          </Link>
          <span className="text-xs text-muted">
            @{post.author.username} · {formatRelativeTime(post.createdAt)}
            {editedAt && " · editado"}
          </span>
        </div>

        {/* gap-5: las zonas táctiles (tap-area) crecen 10px a cada lado y no se pisan */}
        {isOwner && deleteStage === "idle" && !editing && (
          <div className="ml-auto flex shrink-0 items-center gap-5">
            <button
              type="button"
              onClick={startEditing}
              className="tap-area text-xs text-muted hover:text-primary"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() => setDeleteStage("confirming")}
              className="tap-area text-xs text-muted hover:text-danger"
            >
              Eliminar
            </button>
          </div>
        )}
      </div>

      {deleteStage !== "idle" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-sm">
          <span>¿Eliminar esta publicación?</span>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={deleteStage === "deleting"}
            className="font-semibold text-danger disabled:opacity-50"
          >
            {deleteStage === "deleting" ? "Eliminando…" : "Sí, eliminar"}
          </button>
          <button
            type="button"
            onClick={() => setDeleteStage("idle")}
            disabled={deleteStage === "deleting"}
            className="text-muted hover:underline disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      )}
      {deleteError && <p className="text-sm text-danger">{deleteError}</p>}

      {/* Editando, el texto es un cuadro: no puede ir dentro del enlace al detalle */}
      {editing ? (
        <>
          {editForm}
          {mediaGrid}
        </>
      ) : linkToDetail ? (
        <Link href={`/p/${post.id}`}>{postBody}</Link>
      ) : (
        postBody
      )}

      <div className="flex flex-wrap items-center gap-x-[22px] gap-y-2 text-sm tabular-nums">
        <ReactionButton
          myReaction={myReaction}
          onSelect={changeReaction}
          onRemove={() => changeReaction(null)}
        />
        <span className="text-muted">
          <span aria-hidden="true">
            {topReactions.map((type) => reactionInfo(type).emoji).join("")}{" "}
            {likeCount}
          </span>
          <span className="sr-only">{reactionsLabel}</span>
        </span>
        {/* En el feed abre el recuadro para comentar debajo de la publicación; ya en
            el detalle, enfoca el formulario de CommentSection, que está justo abajo. */}
        {linkToDetail ? (
          <button
            type="button"
            onClick={() => {
              setCommentBoxOpen((open) => !open);
              setCommentPosted(false);
            }}
            aria-label={commentLabel}
            aria-expanded={commentBoxOpen}
            className={
              commentBoxOpen
                ? "tap-area text-primary"
                : "tap-area text-muted hover:text-primary"
            }
          >
            💬 {commentCount}
          </button>
        ) : (
          <button
            type="button"
            onClick={focusCommentInput}
            aria-label={commentLabel}
            className="tap-area text-muted hover:text-primary"
          >
            💬 {commentCount}
          </button>
        )}
      </div>

      {commentBoxOpen && (
        <QuickCommentBox
          postId={post.id}
          onPosted={() => {
            setCommentBoxOpen(false);
            setCommentPosted(true);
          }}
          onClose={() => setCommentBoxOpen(false)}
        />
      )}

      {commentPosted && (
        <p role="status" className="text-sm text-primary">
          Comentario publicado.{" "}
          <Link href={`/p/${post.id}`} className="font-medium underline">
            Ver comentarios
          </Link>
        </p>
      )}
    </article>
  );
}
