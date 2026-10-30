"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { LikeStatusDto, PostDto } from "@red/api-types";
import { Avatar } from "@/components/avatar";
import { apiFetchClient } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/format";
import { cloudinaryImageUrl } from "@/lib/media";

export function PostCard({
  post,
  currentUserId,
}: {
  post: PostDto;
  currentUserId?: string;
}) {
  const authorName = post.author.displayName ?? post.author.username;
  const [likedByMe, setLikedByMe] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [liking, setLiking] = useState(false);
  const [deleteStage, setDeleteStage] = useState<
    "idle" | "confirming" | "deleting"
  >("idle");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);

  const isOwner = currentUserId !== undefined && post.author.id === currentUserId;

  async function confirmDelete() {
    setDeleteStage("deleting");
    setDeleteError(null);
    try {
      await apiFetchClient<void>(`/api/posts/${post.id}`, {
        method: "DELETE",
      });
      setDeleted(true);
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

  return (
    <article className="flex flex-col gap-3 border-b border-border py-4">
      <div className="flex items-center gap-3">
        <Link href={`/u/${post.author.username}`} className="shrink-0">
          <Avatar
            name={authorName}
            avatarPublicId={post.author.avatarPublicId}
            size="sm"
          />
        </Link>
        <div className="flex flex-col">
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
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface px-3 py-2 text-sm">
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

      <Link href={`/p/${post.id}`}>
        {post.content && (
          <p className="whitespace-pre-line">{post.content}</p>
        )}

        {post.media.length > 0 && (
          <div
            className={`mt-1 grid gap-1 ${post.media.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
          >
            {post.media.map((media) => (
              <div
                key={media.publicId}
                className="relative aspect-video overflow-hidden rounded-md bg-surface"
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
      </Link>

      <div className="flex gap-6 text-sm">
        <button
          type="button"
          onClick={toggleLike}
          aria-pressed={likedByMe}
          aria-label={likedByMe ? "Quitar like" : "Dar like"}
          className={
            likedByMe
              ? "font-semibold text-primary"
              : "text-muted hover:text-primary"
          }
        >
          ❤ {likeCount}
        </button>
        <span className="text-muted">💬 {post.commentCount}</span>
      </div>
    </article>
  );
}
