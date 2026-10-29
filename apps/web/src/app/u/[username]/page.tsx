import { notFound } from "next/navigation";
import type { MeDto, PostPageDto, ProfileDto } from "@red/api-types";
import { apiFetchServer } from "@/lib/api-server";
import { ApiError } from "@/lib/api-error";
import { Avatar } from "@/components/avatar";
import { PostCard } from "@/components/post-card";
import { ProfileStats } from "@/components/profile-stats";

async function getProfile(username: string): Promise<ProfileDto> {
  try {
    return await apiFetchServer<ProfileDto>(`/api/users/${username}`);
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 404) notFound();
    throw error;
  }
}

async function getPosts(username: string): Promise<PostPageDto> {
  return apiFetchServer<PostPageDto>(`/api/users/${username}/posts`);
}

async function getMe(): Promise<MeDto> {
  return apiFetchServer<MeDto>("/api/auth/me");
}

export default async function ProfilePage({
  params,
}: PageProps<"/u/[username]">) {
  const { username } = await params;
  const [profile, me] = await Promise.all([getProfile(username), getMe()]);
  const displayName = profile.displayName ?? profile.username;
  const { items: posts } = await getPosts(username);
  const isOwnProfile = me.id === profile.id;

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

      <ProfileStats
        username={profile.username}
        isOwnProfile={isOwnProfile}
        postCount={profile.postCount}
        followingCount={profile.followingCount}
        initialFollowerCount={profile.followerCount}
        initialIsFollowing={profile.isFollowing}
      />

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
