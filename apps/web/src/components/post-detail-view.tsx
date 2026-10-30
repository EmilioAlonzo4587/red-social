"use client";

import { useRouter } from "next/navigation";
import type { CommentPageDto, PostDto } from "@red/api-types";
import { CommentSection } from "@/components/comment-section";
import { PostCard } from "@/components/post-card";

export function PostDetailView({
  post,
  currentUserId,
  initialComments,
}: {
  post: PostDto;
  currentUserId: string;
  initialComments: CommentPageDto;
}) {
  const router = useRouter();

  return (
    <>
      <PostCard
        post={post}
        currentUserId={currentUserId}
        linkToDetail={false}
        onDeleted={() => router.replace("/feed")}
      />
      <CommentSection
        postId={post.id}
        currentUserId={currentUserId}
        initialComments={initialComments}
      />
    </>
  );
}
