import Link from "next/link";
import { Avatar } from "@/components/avatar";

export type Post = {
  id: string;
  authorName: string;
  authorUsername: string;
  content: string;
  mediaCount: number;
  likeCount: number;
  commentCount: number;
  createdAtLabel: string;
};

export function PostCard({ post }: { post: Post }) {
  return (
    <article className="flex flex-col gap-3 border-b border-border py-4">
      <div className="flex items-center gap-3">
        <Avatar name={post.authorName} size="sm" />
        <div className="flex flex-col">
          <Link
            href={`/u/${post.authorUsername}`}
            className="text-sm font-semibold hover:underline"
          >
            {post.authorName}
          </Link>
          <span className="text-xs text-muted">
            @{post.authorUsername} · {post.createdAtLabel}
          </span>
        </div>
      </div>

      <Link href={`/p/${post.id}`}>
        {post.content && <p className="whitespace-pre-line">{post.content}</p>}

        {post.mediaCount > 0 && (
          <div
            className={`mt-1 grid gap-1 ${post.mediaCount === 1 ? "grid-cols-1" : "grid-cols-2"}`}
          >
            {Array.from({ length: post.mediaCount }).map((_, i) => (
              <div
                key={i}
                className="aspect-video rounded-md bg-surface"
                aria-hidden
              />
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
