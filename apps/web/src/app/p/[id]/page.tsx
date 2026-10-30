import { notFound } from "next/navigation";
import type { CommentPageDto, MeDto, PostDto } from "@red/api-types";
import { PostDetailView } from "@/components/post-detail-view";
import { ApiError } from "@/lib/api-error";
import { apiFetchServer } from "@/lib/api-server";

async function getPost(id: string): Promise<PostDto> {
  try {
    return await apiFetchServer<PostDto>(`/api/posts/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 404) notFound();
    throw error;
  }
}

function getComments(id: string): Promise<CommentPageDto> {
  return apiFetchServer<CommentPageDto>(`/api/posts/${id}/comments`);
}

function getMe(): Promise<MeDto> {
  return apiFetchServer<MeDto>("/api/auth/me");
}

export default async function PostDetailPage({
  params,
}: PageProps<"/p/[id]">) {
  const { id } = await params;
  const [post, me] = await Promise.all([getPost(id), getMe()]);
  const comments = await getComments(id);

  return (
    <main className="mx-auto max-w-xl px-4">
      <PostDetailView
        post={post}
        currentUserId={me.id}
        initialComments={comments}
      />
    </main>
  );
}
