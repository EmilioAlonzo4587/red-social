"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { LikeStatusDto, PostDto } from "@red/api-types";
import { Avatar } from "@/components/avatar";
import { focusCommentInput } from "@/components/comment-section";
import { QuickCommentBox } from "@/components/quick-comment-box";
import { apiFetchClient } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/format";
import { cloudinaryImageUrl } from "@/lib/media";
import { subscribePostComments, subscribePostLikes } from "@/lib/socket";

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
  const [likedByMe, setLikedByMe] = useState(post.likedByMe);
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

  const isOwner = currentUserId !== undefined && post.author.id === currentUserId;

  // S2-03/S3-18: se suscribe a post:{id} mientras la tarjeta está en pantalla y hace unwatch al desmontar
  useEffect(() => {
    if (deleted) return;
    return subscribePostLikes(post.id, setLikeCount);
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

  async function toggleLike() {
    if (liking) return;
    const next = !likedByMe;
    const previous = { likedByMe, likeCount };

    // Optimista (S2-10): se ve al toque, se corrige si la api falla.
    setLikedByMe(next);
    setLikeCount((count) => count + (next ? 1 : -1));
    setLiking(true);
    try {
      const result = await apiFetchClient<LikeStatusDto>(
        `/api/posts/${post.id}/like`,
        { method: next ? "PUT" : "DELETE" },
      );
      setLikedByMe(result.likedByMe);
      setLikeCount(result.likeCount);
    } catch {
      setLikedByMe(previous.likedByMe);
      setLikeCount(previous.likeCount);
    } finally {
      setLiking(false);
    }
  }

  if (deleted) return null;

  const postBody = (
    <>
      {post.content && (
        <p className="whitespace-pre-line text-base leading-[1.55] [overflow-wrap:anywhere]">
          {post.content}
        </p>
      )}

      {post.media.length > 0 && (
        <div
          className={`mt-1 grid gap-1 ${post.media.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
        >
          {post.media.map((media) => (
            <div
              key={media.publicId}
              className="relative aspect-video overflow-hidden rounded-xl bg-surface"
            >
              <Image
                src={cloudinaryImageUrl(media.publicId)}
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, 576px"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      )}
    </>
  );

  const commentLabel = `Comentar (${commentCount} ${commentCount === 1 ? "comentario" : "comentarios"})`;

  return (
    <article className="flex flex-col gap-2.5 border-b border-border py-4">
      <div className="flex items-center gap-3">
        <Link href={`/u/${post.author.username}`} className="shrink-0">
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
          </span>
        </div>

        {isOwner && deleteStage === "idle" && (
          <button
            type="button"
            onClick={() => setDeleteStage("confirming")}
            className="ml-auto text-xs text-muted hover:text-red-600"
          >
            Eliminar
          </button>
        )}
      </div>

      {deleteStage !== "idle" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-sm">
          <span>¿Eliminar esta publicación?</span>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={deleteStage === "deleting"}
            className="font-semibold text-red-600 disabled:opacity-50"
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
      {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}

      {linkToDetail ? (
        <Link href={`/p/${post.id}`}>{postBody}</Link>
      ) : (
        postBody
      )}

      <div className="flex gap-[22px] text-sm tabular-nums">
        <button
          type="button"
          onClick={toggleLike}
          aria-pressed={likedByMe}
          aria-label={likedByMe ? "Quitar like" : "Dar like"}
          className={
            likedByMe
              ? "font-semibold text-red-600"
              : "text-muted hover:text-red-600"
          }
        >
          ❤ {likeCount}
        </button>
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
              commentBoxOpen ? "text-primary" : "text-muted hover:text-primary"
            }
          >
            💬 {commentCount}
          </button>
        ) : (
          <button
            type="button"
            onClick={focusCommentInput}
            aria-label={commentLabel}
            className="text-muted hover:text-primary"
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
