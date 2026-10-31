import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CommentPageDto, PostDto } from "@red/api-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostDetailView } from "./post-detail-view";

const { apiFetchClient } = vi.hoisted(() => ({ apiFetchClient: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetchClient }));

vi.mock("@/lib/socket", () => ({
  subscribePostLikes: vi.fn(() => () => {}),
  subscribePostComments: vi.fn(() => () => {}),
}));

const { push, replace } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));

const POST: PostDto = {
  id: "11111111-1111-1111-1111-111111111111",
  author: {
    id: "u1",
    username: "ana_lopez",
    displayName: "Ana López",
    avatarPublicId: null,
  },
  content: "Primer atardecer del semestre",
  media: [],
  likeCount: 3,
  commentCount: 0,
  likedByMe: false,
  myReaction: null,
  topReactions: [],
  createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  editedAt: null,
};

const EMPTY_COMMENTS: CommentPageDto = { items: [], nextCursor: null };

describe("PostDetailView (S3-08)", () => {
  beforeEach(() => {
    apiFetchClient.mockReset();
    push.mockClear();
    replace.mockClear();
  });

  it("muestra la publicación y la sección de comentarios", () => {
    render(
      <PostDetailView
        post={POST}
        currentUserId="u1"
        initialComments={EMPTY_COMMENTS}
      />,
    );
    expect(
      screen.getByText("Primer atardecer del semestre"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Aún no hay comentarios. Sé el primero en comentar."),
    ).toBeInTheDocument();
  });

  it("al eliminar la publicación propia, redirige a /feed", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockResolvedValueOnce(undefined);

    render(
      <PostDetailView
        post={POST}
        currentUserId="u1"
        initialComments={EMPTY_COMMENTS}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    await user.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/feed"));
  });
});
