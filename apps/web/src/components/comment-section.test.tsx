import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CommentDto, CommentPageDto } from "@red/api-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-error";
import { CommentSection } from "./comment-section";

const { apiFetchClient } = vi.hoisted(() => ({ apiFetchClient: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetchClient }));

const { subscribePostComments, commentCountListeners, unsubscribe } =
  vi.hoisted(() => {
    const commentCountListeners: ((count: number) => void)[] = [];
    const unsubscribe = vi.fn();
    const subscribePostComments = vi.fn(
      (_postId: string, listener: (count: number) => void) => {
        commentCountListeners.push(listener);
        return unsubscribe;
      },
    );
    return { subscribePostComments, commentCountListeners, unsubscribe };
  });
vi.mock("@/lib/socket", () => ({ subscribePostComments }));

function emitCommentCount(count: number) {
  for (const listener of commentCountListeners) listener(count);
}

const POST_ID = "11111111-1111-1111-1111-111111111111";

function comment(id: string, authorId: string, content: string): CommentDto {
  return {
    id,
    postId: POST_ID,
    author: {
      id: authorId,
      username: `user_${authorId}`,
      displayName: `Nombre ${authorId}`,
      avatarPublicId: null,
    },
    content,
    createdAt: new Date(Date.now() - 60 * 1000).toISOString(),
    parentId: null,
    replyCount: 0,
    deleted: false,
  };
}

function page(items: CommentDto[], nextCursor: string | null = null): CommentPageDto {
  return { items, nextCursor };
}

describe("CommentSection (S3-08)", () => {
  beforeEach(() => {
    apiFetchClient.mockReset();
    subscribePostComments.mockClear();
    commentCountListeners.length = 0;
    unsubscribe.mockClear();
  });

  it("estado vacío cuando no hay comentarios", () => {
    render(
      <CommentSection
        postId={POST_ID}
        initialComments={page([])}
        currentUserId="u1"
      />,
    );
    expect(
      screen.getByText("Aún no hay comentarios. Sé el primero en comentar."),
    ).toBeInTheDocument();
  });

  it("muestra cada comentario con autor, contenido y enlace al perfil", () => {
    render(
      <CommentSection
        postId={POST_ID}
        initialComments={page([comment("c1", "u2", "Qué buena foto")])}
        currentUserId="u1"
      />,
    );
    expect(screen.getByText("Nombre u2")).toBeInTheDocument();
    expect(screen.getByText("Qué buena foto")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nombre u2" })).toHaveAttribute(
      "href",
      "/u/user_u2",
    );
  });

  it("solo muestra el botón Eliminar en los comentarios propios", () => {
    render(
      <CommentSection
        postId={POST_ID}
        initialComments={page([
          comment("c1", "u1", "mío"),
          comment("c2", "u2", "ajeno"),
        ])}
        currentUserId="u1"
      />,
    );
    expect(screen.getAllByRole("button", { name: "Eliminar" })).toHaveLength(1);
  });

  it("comentar: envía el texto y lo agrega a la lista", async () => {
    const user = userEvent.setup();
    const created = comment("c1", "u1", "primer comentario");
    apiFetchClient.mockResolvedValueOnce(created);

    render(
      <CommentSection
        postId={POST_ID}
        initialComments={page([])}
        currentUserId="u1"
      />,
    );

    await user.type(
      screen.getByPlaceholderText("Escribe un comentario…"),
      "primer comentario",
    );
    await user.click(screen.getByRole("button", { name: "Comentar" }));

    await waitFor(() => {
      expect(apiFetchClient).toHaveBeenCalledWith(
        `/api/posts/${POST_ID}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "primer comentario" }),
        },
      );
    });
    expect(screen.getByText("primer comentario")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Escribe un comentario…")).toHaveValue(
      "",
    );
  });

  it("comentar con Enter: envía; Shift+Enter hace un salto de línea (S4-16)", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockResolvedValueOnce(comment("c1", "u1", "uno\ndos"));
    render(
      <CommentSection
        postId={POST_ID}
        initialComments={page([])}
        currentUserId="u1"
      />,
    );
    const input = screen.getByPlaceholderText("Escribe un comentario…");
    expect(input).toHaveAttribute("enterkeyhint", "send");

    await user.type(input, "uno{Shift>}{Enter}{/Shift}dos");
    expect(apiFetchClient).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(apiFetchClient).toHaveBeenCalledWith(
        `/api/posts/${POST_ID}/comments`,
        expect.objectContaining({
          body: JSON.stringify({ content: "uno\ndos" }),
        }),
      );
    });
    expect(apiFetchClient).toHaveBeenCalledTimes(1);
  });

  it("no deja comentar en blanco", async () => {
    render(
      <CommentSection
        postId={POST_ID}
        initialComments={page([])}
        currentUserId="u1"
      />,
    );
    expect(screen.getByRole("button", { name: "Comentar" })).toBeDisabled();
  });

  it("400 por contenido muestra el error junto al campo", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockRejectedValueOnce(
      new ApiError(
        {
          statusCode: 400,
          error: "Bad Request",
          message: "Error de validación",
          details: [{ field: "content", rule: "maxLength" }],
        },
        400,
      ),
    );

    render(
      <CommentSection
        postId={POST_ID}
        initialComments={page([])}
        currentUserId="u1"
      />,
    );
    await user.type(
      screen.getByPlaceholderText("Escribe un comentario…"),
      "x",
    );
    await user.click(screen.getByRole("button", { name: "Comentar" }));

    await waitFor(() => {
      expect(screen.getByText("muy largo")).toBeInTheDocument();
    });
  });

  it("eliminar: pide confirmación y, al aceptar, llama DELETE y lo quita de la lista", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockResolvedValueOnce(undefined);

    render(
      <CommentSection
        postId={POST_ID}
        initialComments={page([comment("c1", "u1", "mío")])}
        currentUserId="u1"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(screen.getByText("¿Eliminar este comentario?")).toBeInTheDocument();
    expect(apiFetchClient).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    await waitFor(() => {
      expect(screen.queryByText("mío")).not.toBeInTheDocument();
    });
    expect(apiFetchClient).toHaveBeenCalledWith("/api/comments/c1", {
      method: "DELETE",
    });
  });

  it("cancelar la confirmación no elimina nada", async () => {
    const user = userEvent.setup();
    render(
      <CommentSection
        postId={POST_ID}
        initialComments={page([comment("c1", "u1", "mío")])}
        currentUserId="u1"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(
      screen.queryByText("¿Eliminar este comentario?"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("mío")).toBeInTheDocument();
    expect(apiFetchClient).not.toHaveBeenCalled();
  });

  it("si eliminar falla, muestra un error y deja el comentario", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockRejectedValueOnce(new Error("caído"));

    render(
      <CommentSection
        postId={POST_ID}
        initialComments={page([comment("c1", "u1", "mío")])}
        currentUserId="u1"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    await user.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    await waitFor(() => {
      expect(
        screen.getByText("No se pudo eliminar. Intenta de nuevo."),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("mío")).toBeInTheDocument();
  });

  it("Cargar más pide la siguiente página con el cursor y agrega comentarios al final", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockResolvedValueOnce(page([comment("c2", "u2", "nuevo")]));

    render(
      <CommentSection
        postId={POST_ID}
        initialComments={page([comment("c1", "u1", "viejo")], "cursor-1")}
        currentUserId="u1"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cargar más" }));

    await waitFor(() => {
      expect(apiFetchClient).toHaveBeenCalledWith(
        `/api/posts/${POST_ID}/comments?cursor=cursor-1`,
      );
    });
    expect(screen.getByText("nuevo")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cargar más" }),
    ).not.toBeInTheDocument();
  });

  it("si Cargar más falla, muestra un error", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockRejectedValueOnce(new Error("caído"));

    render(
      <CommentSection
        postId={POST_ID}
        initialComments={page([comment("c1", "u1", "viejo")], "cursor-1")}
        currentUserId="u1"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Cargar más" }));

    await waitFor(() => {
      expect(
        screen.getByText("No se pudo cargar más comentarios."),
      ).toBeInTheDocument();
    });
  });

  it("al estar al final, un contador mayor en vivo trae el comentario nuevo sin que recargues (S3-08)", async () => {
    apiFetchClient.mockResolvedValueOnce(
      page([comment("c1", "u1", "viejo"), comment("c2", "u2", "nuevo en vivo")]),
    );

    render(
      <CommentSection
        postId={POST_ID}
        initialComments={page([comment("c1", "u1", "viejo")])}
        currentUserId="u1"
      />,
    );
    expect(subscribePostComments).toHaveBeenCalledWith(
      POST_ID,
      expect.any(Function),
    );

    emitCommentCount(2);

    await waitFor(() => {
      expect(apiFetchClient).toHaveBeenCalledWith(
        `/api/posts/${POST_ID}/comments`,
      );
    });
    await waitFor(() => {
      expect(screen.getByText("nuevo en vivo")).toBeInTheDocument();
    });
  });

  it("si todavía falta Cargar más, un contador mayor en vivo no toca nada", () => {
    render(
      <CommentSection
        postId={POST_ID}
        initialComments={page([comment("c1", "u1", "viejo")], "cursor-1")}
        currentUserId="u1"
      />,
    );
    apiFetchClient.mockClear();

    emitCommentCount(5);

    expect(apiFetchClient).not.toHaveBeenCalled();
  });

  it("si el contador en vivo ya coincide con lo que tienes (tu propia acción), no vuelve a pedir nada", () => {
    render(
      <CommentSection
        postId={POST_ID}
        initialComments={page([comment("c1", "u1", "viejo")])}
        currentUserId="u1"
      />,
    );
    apiFetchClient.mockClear();

    emitCommentCount(1);

    expect(apiFetchClient).not.toHaveBeenCalled();
  });

  it("emojis (S4-10): inserta donde está el cursor, envía el comentario y cierra el panel", async () => {
    const user = userEvent.setup();
    render(
      <CommentSection
        postId={POST_ID}
        initialComments={page([])}
        currentUserId="u1"
      />,
    );
    const input = screen.getByPlaceholderText<HTMLTextAreaElement>(
      "Escribe un comentario…",
    );
    await user.type(input, "Genial");

    await user.click(screen.getByRole("button", { name: "Abrir emojis" }));
    await user.click(screen.getByRole("button", { name: "Insertar aplausos" }));
    expect(input).toHaveValue("Genial👏");

    apiFetchClient.mockResolvedValueOnce(comment("c9", "u1", "Genial👏"));
    await user.click(screen.getByRole("button", { name: "Comentar" }));

    await waitFor(() => {
      expect(apiFetchClient).toHaveBeenCalledWith(
        `/api/posts/${POST_ID}/comments`,
        expect.objectContaining({
          body: JSON.stringify({ content: "Genial👏" }),
        }),
      );
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Elegir emoji" }),
      ).not.toBeInTheDocument();
    });
  });

  it("emojis: Escape en el cuadro cierra el panel y no pasa de 1000 caracteres (RN07)", async () => {
    const user = userEvent.setup();
    render(
      <CommentSection
        postId={POST_ID}
        initialComments={page([])}
        currentUserId="u1"
      />,
    );
    const input = screen.getByPlaceholderText<HTMLTextAreaElement>(
      "Escribe un comentario…",
    );
    fireEvent.change(input, { target: { value: "a".repeat(999) } });

    await user.click(screen.getByRole("button", { name: "Abrir emojis" }));
    await user.click(screen.getByRole("button", { name: "Insertar sonrisa" }));
    expect(input.value).toHaveLength(999);

    fireEvent.keyDown(input, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Elegir emoji" }),
    ).not.toBeInTheDocument();
  });

  describe("respuestas (S4-14)", () => {
    function renderWith(items: CommentDto[]) {
      render(
        <CommentSection
          postId={POST_ID}
          initialComments={page(items)}
          currentUserId="u1"
        />,
      );
    }

    it("Responder abre un cuadro debajo del comentario y envía la respuesta con parentId", async () => {
      const user = userEvent.setup();
      renderWith([comment("c1", "u2", "¿Qué opinan?")]);

      await user.click(
        screen.getByRole("button", { name: "Responder a Nombre u2" }),
      );
      const box = screen.getByLabelText("Escribe una respuesta");
      expect(box).toHaveFocus();

      const reply = { ...comment("r1", "u1", "Me encanta"), parentId: "c1" };
      apiFetchClient.mockResolvedValueOnce(reply);
      await user.type(box, "Me encanta");
      await user.click(screen.getByRole("button", { name: "Enviar" }));

      expect(apiFetchClient).toHaveBeenCalledWith(
        `/api/posts/${POST_ID}/comments`,
        expect.objectContaining({
          body: JSON.stringify({ content: "Me encanta", parentId: "c1" }),
        }),
      );
      // La respuesta aparece en el hilo, sin recargar
      const thread = await screen.findByRole("list", { name: "Respuestas" });
      expect(thread).toHaveTextContent("Me encanta");
      expect(
        screen.queryByLabelText("Escribe una respuesta"),
      ).not.toBeInTheDocument();
    });

    it("Ver N respuestas trae las respuestas del comentario", async () => {
      const user = userEvent.setup();
      renderWith([{ ...comment("c1", "u2", "Raíz"), replyCount: 2 }]);
      apiFetchClient.mockResolvedValueOnce(
        page([
          { ...comment("r1", "u3", "Primera"), parentId: "c1" },
          { ...comment("r2", "u4", "Segunda"), parentId: "c1" },
        ]),
      );

      await user.click(screen.getByRole("button", { name: "Ver 2 respuestas" }));

      expect(apiFetchClient).toHaveBeenCalledWith("/api/comments/c1/replies");
      const thread = await screen.findByRole("list", { name: "Respuestas" });
      expect(thread).toHaveTextContent("Primera");
      expect(thread).toHaveTextContent("Segunda");
      await user.click(screen.getByRole("button", { name: "Ocultar respuestas" }));
      expect(
        screen.queryByRole("list", { name: "Respuestas" }),
      ).not.toBeInTheDocument();
    });

    it("responder a una respuesta precarga @usuario y la manda al mismo hilo", async () => {
      const user = userEvent.setup();
      renderWith([{ ...comment("c1", "u2", "Raíz"), replyCount: 1 }]);
      apiFetchClient.mockResolvedValueOnce(
        page([{ ...comment("r1", "u3", "Primera"), parentId: "c1" }]),
      );
      await user.click(screen.getByRole("button", { name: "Ver 1 respuesta" }));
      await screen.findByText("Primera");

      await user.click(
        screen.getByRole("button", { name: "Responder a Nombre u3" }),
      );
      expect(screen.getByLabelText("Escribe una respuesta")).toHaveValue(
        "@user_u3 ",
      );
    });

    it("un comentario eliminado con respuestas se muestra como eliminado, con sus respuestas", () => {
      renderWith([
        {
          ...comment("c1", "u2", ""),
          content: null,
          deleted: true,
          replyCount: 1,
        },
      ]);
      expect(screen.getByText("Comentario eliminado")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Responder a/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Ver 1 respuesta" }),
      ).toBeInTheDocument();
    });

    it("el contador en vivo cuenta también las respuestas: no resincroniza si coincide", () => {
      renderWith([{ ...comment("c1", "u2", "Raíz"), replyCount: 2 }]);
      emitCommentCount(3); // 1 comentario + 2 respuestas
      expect(apiFetchClient).not.toHaveBeenCalled();
    });
  });
});
