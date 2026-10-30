import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import type { MeDto, PostDto, PostPageDto } from "@red/api-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-error";
import FeedPage from "./page";

const { uploadMedia } = vi.hoisted(() => ({ uploadMedia: vi.fn() }));
vi.mock("@/lib/media", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/media")>();
  return { ...actual, uploadMedia };
});

const { apiFetchClient } = vi.hoisted(() => ({ apiFetchClient: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetchClient }));

vi.mock("@/lib/socket", () => ({
  subscribePostLikes: vi.fn(() => () => {}),
}));

function post(id: string): PostDto {
  return {
    id,
    author: {
      id: "u1",
      username: "ana_lopez",
      displayName: "Ana López",
      avatarPublicId: null,
    },
    content: `Publicación ${id}`,
    media: [],
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    createdAt: new Date().toISOString(),
  };
}

function page(items: PostDto[], nextCursor: string | null = null): PostPageDto {
  return { items, nextCursor };
}

const ME: MeDto = {
  id: "u1",
  username: "ana_lopez",
  displayName: "Ana López",
  avatarPublicId: null,
  email: "ana@example.com",
  bio: null,
  createdAt: new Date().toISOString(),
};

describe("FeedPage", () => {
  beforeEach(() => {
    apiFetchClient.mockReset();
    // FeedPage también pide /api/auth/me (para el botón de eliminar); los tests
    // de abajo solo encolan valores para las llamadas de feed con mockResolvedValueOnce,
    // así que esta queda como respuesta por defecto para la llamada sin encolar.
    apiFetchClient.mockResolvedValue(ME);
    uploadMedia.mockReset();
  });

  it("carga Explorar al montar", async () => {
    apiFetchClient.mockResolvedValueOnce(page([post("1"), post("2")]));
    render(<FeedPage />);

    expect(apiFetchClient).toHaveBeenCalledWith("/api/feed/explore");
    await waitFor(() => {
      expect(screen.getByText("Publicación 1")).toBeInTheDocument();
    });
    expect(screen.getByText("Publicación 2")).toBeInTheDocument();
  });

  it("con Strict Mode (desarrollo) carga la pestaña en vez de quedarse en Cargando…", async () => {
    // Strict Mode monta, limpia y vuelve a montar el efecto: la primera petición se descarta
    apiFetchClient.mockImplementation((path: string) =>
      Promise.resolve(path === "/api/auth/me" ? ME : page([post("1")])),
    );
    render(
      <StrictMode>
        <FeedPage />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByText("Publicación 1")).toBeInTheDocument();
    });
    expect(screen.queryByText("Cargando…")).not.toBeInTheDocument();
  });

  it("cambiar a Siguiendo pide /api/feed", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockResolvedValueOnce(page([post("1")])); // explorar al montar
    render(<FeedPage />);
    await waitFor(() => expect(screen.getByText("Publicación 1")).toBeInTheDocument());

    apiFetchClient.mockResolvedValueOnce(page([])); // siguiendo, vacío
    await user.click(screen.getByRole("button", { name: "Siguiendo" }));

    await waitFor(() => {
      expect(apiFetchClient).toHaveBeenCalledWith("/api/feed");
    });
  });

  it("estado vacío en Siguiendo invita a ir a Explorar", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockResolvedValueOnce(page([])); // explorar al montar, vacío también
    render(<FeedPage />);
    await waitFor(() =>
      expect(apiFetchClient).toHaveBeenCalledWith("/api/feed/explore"),
    );

    apiFetchClient.mockResolvedValueOnce(page([]));
    await user.click(screen.getByRole("button", { name: "Siguiendo" }));

    await waitFor(() => {
      expect(
        screen.getByText(/Aún no sigues a nadie/),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Ir a Explorar" })).toBeInTheDocument();
  });

  it("muestra un error si falla la carga", async () => {
    apiFetchClient.mockRejectedValueOnce(
      new ApiError(
        {
          statusCode: 500,
          error: "Internal Server Error",
          message: "Error interno del servidor",
          details: [],
        },
        500,
      ),
    );
    render(<FeedPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Error interno del servidor"),
      ).toBeInTheDocument();
    });
  });

  it("Cargar más pide la siguiente página con el cursor y agrega publicaciones", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockResolvedValueOnce(page([post("1")], "cursor-1"));
    render(<FeedPage />);
    await waitFor(() => expect(screen.getByText("Publicación 1")).toBeInTheDocument());

    apiFetchClient.mockResolvedValueOnce(page([post("2")], null));
    await user.click(screen.getByRole("button", { name: "Cargar más" }));

    await waitFor(() => {
      expect(apiFetchClient).toHaveBeenCalledWith(
        "/api/feed/explore?cursor=cursor-1",
      );
    });
    expect(screen.getByText("Publicación 2")).toBeInTheDocument();
    // Ya no hay próxima página: el botón desaparece
    expect(
      screen.queryByRole("button", { name: "Cargar más" }),
    ).not.toBeInTheDocument();
  });

  it("no muestra Cargar más cuando no hay próxima página", async () => {
    apiFetchClient.mockResolvedValueOnce(page([post("1")], null));
    render(<FeedPage />);
    await waitFor(() => expect(screen.getByText("Publicación 1")).toBeInTheDocument());
    expect(
      screen.queryByRole("button", { name: "Cargar más" }),
    ).not.toBeInTheDocument();
  });

  it("publicar desde el compositor vuelve a cargar el feed", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockResolvedValueOnce(page([post("1")])); // carga inicial
    render(<FeedPage />);
    await waitFor(() => expect(screen.getByText("Publicación 1")).toBeInTheDocument());

    apiFetchClient.mockResolvedValueOnce(post("nueva")); // POST /api/posts del compositor
    apiFetchClient.mockResolvedValueOnce(page([post("nueva")])); // recarga de explorar

    await user.type(
      screen.getByPlaceholderText("¿Qué está pasando?"),
      "hola",
    );
    await user.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() => {
      expect(apiFetchClient).toHaveBeenCalledWith(
        "/api/feed/explore",
      );
    });
    // Se llamó dos veces a /api/feed/explore: la carga inicial y la de después de publicar
    const explorarCalls = apiFetchClient.mock.calls.filter(
      ([path]) => path === "/api/feed/explore",
    );
    expect(explorarCalls.length).toBe(2);
  });
});
