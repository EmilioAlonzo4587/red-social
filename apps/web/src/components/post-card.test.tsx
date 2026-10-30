import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LikeStatusDto, PostDto } from "@red/api-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostCard } from "./post-card";

const { apiFetchClient } = vi.hoisted(() => ({ apiFetchClient: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetchClient }));

const { subscribePostLikes, subscribePostComments, unsubscribe } = vi.hoisted(
  () => {
    const unsubscribe = vi.fn();
    const subscribePostLikes = vi.fn<
      (postId: string, onLikeCount: (count: number) => void) => () => void
    >(() => unsubscribe);
    const subscribePostComments = vi.fn<
      (postId: string, onCommentCount: (count: number) => void) => () => void
    >(() => unsubscribe);
    return { subscribePostLikes, subscribePostComments, unsubscribe };
  },
);
vi.mock("@/lib/socket", () => ({ subscribePostLikes, subscribePostComments }));

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
    subscribePostLikes.mockClear();
    subscribePostComments.mockClear();
    unsubscribe.mockClear();
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
    expect(
      screen.getByText("Primer atardecer del semestre").closest("a"),
    ).toHaveAttribute("href", `/p/${BASE_POST.id}`);
  });

  it("linkToDetail=false (S3-08, ya estás en /p/[id]): no enlaza el contenido a sí misma", () => {
    render(<PostCard post={BASE_POST} linkToDetail={false} />);
    expect(
      screen.getByText("Primer atardecer del semestre").closest("a"),
    ).not.toBeInTheDocument();
  });

  it("el avatar del autor también enlaza a su perfil", () => {
    render(<PostCard post={BASE_POST} />);
    // Sin avatarPublicId, el avatar muestra las iniciales ("AL") como texto del enlace.
    expect(screen.getByRole("link", { name: "AL" })).toHaveAttribute(
      "href",
      "/u/ana_lopez",
    );
  });

  it("muestra la foto real del autor si tiene avatarPublicId", () => {
    const post: PostDto = {
      ...BASE_POST,
      author: { ...BASE_POST.author, avatarPublicId: "users/u1/foto" },
    };
    const { container } = render(<PostCard post={post} />);
    expect(screen.queryByText("AL")).not.toBeInTheDocument();
    expect(container.querySelectorAll("img")).toHaveLength(1);
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

  it("no muestra el botón de eliminar si no sos el autor", () => {
    render(<PostCard post={BASE_POST} currentUserId="otro-usuario" />);
    expect(
      screen.queryByRole("button", { name: "Eliminar" }),
    ).not.toBeInTheDocument();
  });

  it("no muestra el botón de eliminar sin currentUserId", () => {
    render(<PostCard post={BASE_POST} />);
    expect(
      screen.queryByRole("button", { name: "Eliminar" }),
    ).not.toBeInTheDocument();
  });

  it("eliminar: pide confirmación antes de llamar a la api", async () => {
    const user = userEvent.setup();
    render(<PostCard post={BASE_POST} currentUserId={BASE_POST.author.id} />);

    await user.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(
      screen.getByText("¿Eliminar esta publicación?"),
    ).toBeInTheDocument();
    expect(apiFetchClient).not.toHaveBeenCalled();
  });

  it("cancelar la confirmación no elimina nada", async () => {
    const user = userEvent.setup();
    render(<PostCard post={BASE_POST} currentUserId={BASE_POST.author.id} />);

    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(
      screen.queryByText("¿Eliminar esta publicación?"),
    ).not.toBeInTheDocument();
    expect(apiFetchClient).not.toHaveBeenCalled();
  });

  it("confirmar elimina: llama DELETE y la publicación desaparece", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockResolvedValueOnce(undefined);

    render(<PostCard post={BASE_POST} currentUserId={BASE_POST.author.id} />);
    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    await user.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    await waitFor(() => {
      expect(
        screen.queryByText("Primer atardecer del semestre"),
      ).not.toBeInTheDocument();
    });
    expect(apiFetchClient).toHaveBeenCalledWith(
      `/api/posts/${BASE_POST.id}`,
      { method: "DELETE" },
    );
  });

  it("confirmar elimina: llama a onDeleted (S3-08, para que /p/[id] redirija)", async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    apiFetchClient.mockResolvedValueOnce(undefined);

    render(
      <PostCard
        post={BASE_POST}
        currentUserId={BASE_POST.author.id}
        onDeleted={onDeleted}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    await user.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });

  it("si eliminar falla, no llama a onDeleted", async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    apiFetchClient.mockRejectedValueOnce(new Error("caído"));

    render(
      <PostCard
        post={BASE_POST}
        currentUserId={BASE_POST.author.id}
        onDeleted={onDeleted}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    await user.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    await waitFor(() => {
      expect(
        screen.getByText("No se pudo eliminar. Intenta de nuevo."),
      ).toBeInTheDocument();
    });
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("si eliminar falla, muestra un error y deja la publicación", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockRejectedValueOnce(new Error("caído"));

    render(<PostCard post={BASE_POST} currentUserId={BASE_POST.author.id} />);
    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    await user.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    await waitFor(() => {
      expect(
        screen.getByText("No se pudo eliminar. Intenta de nuevo."),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText("Primer atardecer del semestre"),
    ).toBeInTheDocument();
  });

  it("se suscribe a likes en vivo al montar, actualiza el contador y se desuscribe al desmontar", () => {
    let onLikeCount: ((count: number) => void) | undefined;
    subscribePostLikes.mockImplementationOnce(
      (_postId: string, listener: (count: number) => void) => {
        onLikeCount = listener;
        return unsubscribe;
      },
    );

    const { unmount } = render(<PostCard post={BASE_POST} />);
    expect(subscribePostLikes).toHaveBeenCalledWith(
      BASE_POST.id,
      expect.any(Function),
    );
    expect(screen.getByText("❤ 3")).toBeInTheDocument();

    act(() => {
      onLikeCount?.(12);
    });
    expect(screen.getByText("❤ 12")).toBeInTheDocument();

    unmount();
    // El mismo unsubscribe lo devuelven tanto likes como comentarios (S3-18): se llama una vez por cada uno.
    expect(unsubscribe).toHaveBeenCalledTimes(2);
  });

  it("se suscribe a comentarios en vivo al montar, actualiza el contador y se desuscribe al desmontar (S3-18)", () => {
    let onCommentCount: ((count: number) => void) | undefined;
    subscribePostComments.mockImplementationOnce(
      (_postId: string, listener: (count: number) => void) => {
        onCommentCount = listener;
        return unsubscribe;
      },
    );

    const { unmount } = render(<PostCard post={BASE_POST} />);
    expect(subscribePostComments).toHaveBeenCalledWith(
      BASE_POST.id,
      expect.any(Function),
    );
    expect(screen.getByText("💬 1")).toBeInTheDocument();

    act(() => {
      onCommentCount?.(5);
    });
    expect(screen.getByText("💬 5")).toBeInTheDocument();

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
  });

  it("el 💬 del feed abre el recuadro para comentar debajo, y se envía ahí mismo", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockResolvedValueOnce({ id: "c1" });
    render(<PostCard post={BASE_POST} />);

    const toggle = screen.getByRole("button", { name: "Comentar (1 comentario)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    const input = screen.getByLabelText("Escribe un comentario");
    expect(input).toHaveFocus();
    await user.type(input, "Qué bonito");
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(apiFetchClient).toHaveBeenCalledWith(
      `/api/posts/${BASE_POST.id}/comments`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ content: "Qué bonito" }),
      }),
    );
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Comentario publicado.");
    });
    expect(screen.queryByLabelText("Escribe un comentario")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver comentarios" })).toHaveAttribute(
      "href",
      `/p/${BASE_POST.id}`,
    );
  });

  it("el recuadro se cierra con Cancelar sin enviar nada", async () => {
    const user = userEvent.setup();
    render(<PostCard post={BASE_POST} />);

    await user.click(screen.getByRole("button", { name: "Comentar (1 comentario)" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByLabelText("Escribe un comentario")).not.toBeInTheDocument();
    expect(apiFetchClient).not.toHaveBeenCalled();
  });

  it("ya en el detalle, el 💬 enfoca el cuadro de comentario sin navegar", async () => {
    render(
      <>
        <PostCard post={BASE_POST} linkToDetail={false} />
        <textarea id="comment-content" aria-label="Escribe un comentario" />
      </>,
    );
    const input = screen.getByRole("textbox", { name: "Escribe un comentario" });
    input.scrollIntoView = vi.fn();

    await userEvent.setup().click(
      screen.getByRole("button", { name: "Comentar (1 comentario)" }),
    );
    expect(input).toHaveFocus();
    expect(input.scrollIntoView).toHaveBeenCalled();
  });
});
