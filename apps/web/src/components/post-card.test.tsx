import { render, screen } from "@testing-library/react";
import type { PostDto } from "@red/api-types";
import { describe, expect, it } from "vitest";
import { PostCard } from "./post-card";

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
});
