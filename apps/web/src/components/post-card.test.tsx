import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LikeStatusDto, PostDto } from "@red/api-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostCard } from "./post-card";

const { apiFetchClient } = vi.hoisted(() => ({ apiFetchClient: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetchClient }));

const BASE_POST: PostDto = {
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
  commentCount: 1,
  likedByMe: false,
  createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
};

describe("PostCard", () => {
  beforeEach(() => {
    apiFetchClient.mockReset();
  });

  it("muestra el autor, el contenido y los contadores", () => {
    render(<PostCard post={BASE_POST} />);
    expect(screen.getByText("Ana López")).toBeInTheDocument();
    expect(
      screen.getByText(/@ana_lopez/, { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Primer atardecer del semestre"),
    ).toBeInTheDocument();
    expect(screen.getByText("❤ 3")).toBeInTheDocument();
    expect(screen.getByText("💬 1")).toBeInTheDocument();
  });

  it("enlaza al perfil del autor y al detalle de la publicación", () => {
    render(<PostCard post={BASE_POST} />);
    expect(screen.getByRole("link", { name: "Ana López" })).toHaveAttribute(
      "href",
      "/u/ana_lopez",
    );
  });

  it("usa el username si no hay nombre visible", () => {
    render(
      <PostCard
        post={{
          ...BASE_POST,
          author: { ...BASE_POST.author, displayName: null },
        }}
      />,
    );
    expect(screen.getByText("ana_lopez")).toBeInTheDocument();
  });

  it("no muestra imágenes si la publicación no tiene", () => {
    render(<PostCard post={BASE_POST} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("muestra una imagen por cada publicId, hasta 4", () => {
    const post: PostDto = {
      ...BASE_POST,
      media: [
        { publicId: "users/u1/a", mediaType: "image", width: 10, height: 10 },
        { publicId: "users/u1/b", mediaType: "image", width: 10, height: 10 },
      ],
    };
    const { container } = render(<PostCard post={post} />);
    // alt="" es a propósito (imagen decorativa sin descripción propia): no tiene
    // rol "img" accesible, así que se consulta directo en el DOM.
    expect(container.querySelectorAll("img")).toHaveLength(2);
  });

  it("dar like: sube el contador al toque y confirma con la respuesta de la api", async () => {
    const user = userEvent.setup();
    const response: LikeStatusDto = { likeCount: 4, likedByMe: true };
    apiFetchClient.mockResolvedValueOnce(response);

    render(<PostCard post={BASE_POST} />);
    const likeButton = screen.getByRole("button", { name: "Dar like" });
    await user.click(likeButton);

    // Optimista: sube antes de que la api responda
    expect(screen.getByText("❤ 4")).toBeInTheDocument();
    await waitFor(() => {
      expect(apiFetchClient).toHaveBeenCalledWith(
        `/api/posts/${BASE_POST.id}/like`,
        { method: "PUT" },
      );
    });
    expect(
      screen.getByRole("button", { name: "Quitar like" }),
    ).toBeInTheDocument();
  });

  it("quitar like: PUT si no tenía like, DELETE si ya lo tenía", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockResolvedValueOnce({
      likeCount: 2,
      likedByMe: false,
    } satisfies LikeStatusDto);

    render(<PostCard post={{ ...BASE_POST, likedByMe: true, likeCount: 3 }} />);
    await user.click(screen.getByRole("button", { name: "Quitar like" }));

    expect(screen.getByText("❤ 2")).toBeInTheDocument();
    await waitFor(() => {
      expect(apiFetchClient).toHaveBeenCalledWith(
        `/api/posts/${BASE_POST.id}/like`,
        { method: "DELETE" },
      );
    });
  });

  it("si la api falla, corrige el like y el contador a como estaban", async () => {
    // user.click espera a que la promesa (incluido el revertido) termine, así que
    // el estado optimista intermedio no se alcanza a observar aquí; lo que importa
    // es que, al final, vuelve a quedar como antes del click.
    const user = userEvent.setup();
    apiFetchClient.mockRejectedValueOnce(new Error("caído"));

    render(<PostCard post={BASE_POST} />);
    await user.click(screen.getByRole("button", { name: "Dar like" }));

    await waitFor(() => {
      expect(screen.getByText("❤ 3")).toBeInTheDocument(); // corregido
    });
    expect(
      screen.getByRole("button", { name: "Dar like" }),
    ).toBeInTheDocument();
  });
});
