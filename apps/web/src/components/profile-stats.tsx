"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FollowStatusDto } from "@red/api-types";
import { apiFetchClient } from "@/lib/api-client";
import { FollowListModal } from "@/components/follow-list-modal";

export function ProfileStats({
  username,
  isOwnProfile,
  postCount,
  followingCount,
  initialFollowerCount,
  initialIsFollowing,
}: {
  username: string;
  isOwnProfile: boolean;
  postCount: number;
  followingCount: number;
  initialFollowerCount: number;
  initialIsFollowing: boolean;
}) {
  const router = useRouter();
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [submitting, setSubmitting] = useState(false);
  const [openList, setOpenList] = useState<"followers" | "following" | null>(
    null,
  );

  // /chat abre (o crea) la conversación con ?username=: no hace falta pedirla aquí
  function openChat() {
    router.push(`/chat?username=${encodeURIComponent(username)}`);
  }

  async function toggleFollow() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await apiFetchClient<FollowStatusDto>(
        `/api/users/${username}/follow`,
        { method: isFollowing ? "DELETE" : "PUT" },
      );
      setIsFollowing(result.isFollowing);
      setFollowerCount(result.followerCount);
    } catch {
      // Sin cambio optimista aquí: si falla, el botón simplemente queda como estaba.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex gap-6 border-y border-border py-3 text-sm">
        <span>
          <strong>{postCount}</strong>{" "}
          <span className="text-muted">publicaciones</span>
        </span>
        <button type="button" onClick={() => setOpenList("followers")}>
          <strong>{followerCount}</strong>{" "}
          <span className="text-muted hover:underline">seguidores</span>
        </button>
        <button type="button" onClick={() => setOpenList("following")}>
          <strong>{followingCount}</strong>{" "}
          <span className="text-muted hover:underline">seguidos</span>
        </button>
      </div>

      {openList && (
        <FollowListModal
          key={openList}
          username={username}
          kind={openList}
          onClose={() => setOpenList(null)}
        />
      )}

      <div className="flex gap-3 py-4">
        {isOwnProfile ? (
          <Link
            href="/perfil/editar"
            className="flex-1 rounded-lg border border-border px-4 py-2 text-center text-sm font-medium hover:bg-surface"
          >
            Editar perfil
          </Link>
        ) : (
          <>
            <button
              type="button"
              onClick={toggleFollow}
              disabled={submitting}
              className={
                isFollowing
                  ? "flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface disabled:opacity-50"
                  : "flex-1 rounded-lg bg-action px-4 py-2 text-sm font-medium text-white hover:bg-action-hover disabled:opacity-50"
              }
            >
              {isFollowing ? "Siguiendo" : "Seguir"}
            </button>
            <button
              type="button"
              onClick={openChat}
              className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface"
            >
              Mensaje
            </button>
          </>
        )}
      </div>
    </>
  );
}
