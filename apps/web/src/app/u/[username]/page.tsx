import { notFound } from "next/navigation";
import type { ProfileDto } from "@red/api-types";
import { apiFetchServer } from "@/lib/api-server";
import { ApiError } from "@/lib/api-error";
import { Avatar } from "@/components/avatar";
import { PostCard, type Post } from "@/components/post-card";

async function getProfile(username: string): Promise<ProfileDto> {
  try {
    return await apiFetchServer<ProfileDto>(`/api/users/${username}`);
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 404) notFound();
    throw error;
  }
}

export default async function ProfilePage({
  params,
}: PageProps<"/u/[username]">) {
  const { username } = await params;
  const profile = await getProfile(username);
  const displayName = profile.displayName ?? profile.username;

  // Placeholder: las publicaciones reales llegan con /users/:username/posts (S2-05)
  const posts: Post[] = [
    {
      id: "p1",
      authorName: displayName,
      authorUsername: profile.username,
      content: "Probando la nueva cuenta por aquí 👋",
      mediaCount: 0,
      likeCount: 9,
      commentCount: 2,
      createdAtLabel: "hace 3 días",
    },
    {
      id: "p2",
      authorName: displayName,
      authorUsername: profile.username,
      content: "",
      mediaCount: 2,
      likeCount: 15,
      commentCount: 1,
      createdAtLabel: "hace 1 semana",
    },
  ];

  return (
    <main className="mx-auto max-w-xl px-4">
      <div className="flex items-center gap-4 py-6">
        <Avatar name={displayName} size="lg" />
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold">{displayName}</h1>
          <span className="text-sm text-muted">@{profile.username}</span>
        </div>
      </div>

      {profile.bio && <p className="pb-4 text-sm">{profile.bio}</p>}

      <div className="flex gap-6 border-y border-border py-3 text-sm">
        <span>
          <strong>{profile.postCount}</strong>{" "}
          <span className="text-muted">publicaciones</span>
        </span>
        <span>
          <strong>{profile.followerCount}</strong>{" "}
          <span className="text-muted">seguidores</span>
        </span>
        <span>
          <strong>{profile.followingCount}</strong>{" "}
          <span className="text-muted">seguidos</span>
        </span>
      </div>

      <div className="flex gap-3 py-4">
        <button
          type="button"
          className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
        >
          {profile.isFollowing ? "Siguiendo" : "Seguir"}
        </button>
        <button
          type="button"
          className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface"
        >
          Mensaje
        </button>
      </div>

      <div className="flex flex-col">
        {posts.length === 0 ? (
          <p className="py-10 text-center text-muted">
            Aún no hay publicaciones.
          </p>
        ) : (
          posts.map((post) => <PostCard key={post.id} post={post} />)
        )}
      </div>
    </main>
  );
}
