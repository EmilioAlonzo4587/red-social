import Image from "next/image";
import Link from "next/link";
import type { PostDto } from "@red/api-types";
import { Avatar } from "@/components/avatar";
import { formatRelativeTime } from "@/lib/format";
import { cloudinaryImageUrl } from "@/lib/media";

export function PostCard({ post }: { post: PostDto }) {
  const authorName = post.author.displayName ?? post.author.username;

  return (
    <article className="flex flex-col gap-3 border-b border-border py-4">
      <div className="flex items-center gap-3">
        <Avatar name={authorName} size="sm" />
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
      </div>

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

      <div className="flex gap-6 text-sm text-muted">
        <span>❤ {post.likeCount}</span>
        <span>💬 {post.commentCount}</span>
      </div>
    </article>
  );
}
