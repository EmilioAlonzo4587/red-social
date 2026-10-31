import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import type {
  FeedNewEvent,
  MeDto,
  PostDto,
  PostPageDto,
  ProfileDto,
} from "@red/api-types";
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
// La lista "Siguiendo" de la columna derecha tiene sus propias pruebas
// (following-panel.test.tsx). Aquí se simula: si no, su pedido a la api podía
// llevarse una respuesta encolada para el feed y la prueba fallaba a veces.
vi.mock("@/components/following-panel", () => ({ FollowingPanel: () => null }));

const { onFeedNew, onExploreNew } = vi.hoisted(() => ({
  onFeedNew: { current: null as ((event: FeedNewEvent) => void) | null },
  onExploreNew: { current: null as ((event: FeedNewEvent) => void) | null },
}));

vi.mock("@/lib/socket", () => ({
  subscribePostLikes: vi.fn(() => () => {}),
  subscribePostComments: vi.fn(() => () => {}),
  subscribeFeedNew: vi.fn((cb: (event: FeedNewEvent) => void) => {
    onFeedNew.current = cb;
    return () => {
      onFeedNew.current = null;
    };
  }),
  subscribeExploreNew: vi.fn((cb: (event: FeedNewEvent) => void) => {
    onExploreNew.current = cb;
    return () => {
      onExploreNew.current = null;
    };
  }),
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
    myReaction: null,
    topReactions: [],
    createdAt: new Date().toISOString(),
    editedAt: null,
  };
}

// Lo que mandan feed:new y explore:new cuando alguien publica (S4-15)
function newPost(postId: string, authorId: string, name: string): FeedNewEvent {
  return {
    postId,
    authorId,
    author: {
      id: authorId,
      username: name.toLowerCase(),
      displayName: name,
      avatarPublicId: null,
    },
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

const PROFILE: ProfileDto = {
  id: "u1",
  username: "ana_lopez",
  displayName: "Ana López",
  avatarPublicId: null,
  bio: null,
  createdAt: new Date().toISOString(),
  postCount: 3,
  followerCount: 128,
  followingCount: 96,
  isFollowing: false,
};

describe("FeedPage", () => {
  beforeEach(() => {
    apiFetchClient.mockReset();
    // FeedPage pide /api/auth/me (botón de eliminar y tarjeta de perfil) y, encadenado,
    // /api/users/{username} (seguidores/seguidos de la tarjeta). Los tests de abajo solo
    // encolan valores para las llamadas de feed con mockResolvedValueOnce, así que esto
    // queda como respuesta por defecto para las llamadas sin encolar.
    // También pide /api/users/{username}/following (lista "Siguiendo" de la columna derecha).
    apiFetchClient.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/api/auth/me"
          ? ME
          : path.endsWith("/following")
            ? page([])
            : PROFILE,
      ),
    );
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
    // Por ruta y no con mockResolvedValueOnce: la lista "Siguiendo" de la columna
    // derecha también pide a la api y se llevaría la respuesta encolada.
    apiFetchClient.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/api/auth/me"
          ? ME
          : path.startsWith("/api/feed") || path.endsWith("/following")
            ? page([])
            : PROFILE,
      ),
    );
    render(<FeedPage />);
    await waitFor(() =>
      expect(apiFetchClient).toHaveBeenCalledWith("/api/feed/explore"),
    );

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
      screen.getByPlaceholderText(/^¿Qué hay de nuevo/),
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

  it("tarjeta de perfil (S4-09): muestra tus datos, con seguidores/seguidos de /api/users/{username}", async () => {
    apiFetchClient.mockResolvedValueOnce(page([]));
    render(<FeedPage />);

    await waitFor(() => {
      expect(screen.getByText("@ana_lopez")).toBeInTheDocument();
    });
    expect(screen.getByText("128")).toBeInTheDocument();
    expect(screen.getByText("96")).toBeInTheDocument();
    await waitFor(() => {
      expect(apiFetchClient).toHaveBeenCalledWith("/api/users/ana_lopez");
    });
  });

  it("tarjeta de perfil: si falla GET /api/auth/me, no se muestra y el feed sigue funcionando", async () => {
    apiFetchClient.mockImplementation((path: string) =>
      path === "/api/auth/me"
        ? Promise.reject(new Error("caído"))
        : Promise.resolve(page([post("1")])),
    );
    render(<FeedPage />);

    await waitFor(() => {
      expect(screen.getByText("Publicación 1")).toBeInTheDocument();
    });
    expect(screen.queryByText("@ana_lopez")).not.toBeInTheDocument();
  });

  it("el compositor saluda con tu nombre al cargar el usuario (S4-17)", async () => {
    apiFetchClient.mockResolvedValueOnce(page([])); // explorar inicial
    render(<FeedPage />);
    expect(
      screen.getByPlaceholderText("¿Qué hay de nuevo?"),
    ).toBeInTheDocument();
    expect(
      await screen.findByPlaceholderText("¿Qué hay de nuevo, Ana?"),
    ).toBeInTheDocument();
  });

  it("muestra tu foto a la izquierda del compositor solo en el celular (S4-16)", async () => {
    apiFetchClient.mockResolvedValueOnce(page([])); // explorar inicial
    render(<FeedPage />);
    const composer = screen.getByPlaceholderText(/^¿Qué hay de nuevo/);
    const row = composer.closest("form")?.parentElement?.parentElement;
    await waitFor(() => expect(row).toHaveTextContent(/^AL/));
    // Oculta desde sm: ahí ya está la tarjeta de perfil de la columna derecha
    expect(row?.firstElementChild).toHaveClass("sm:hidden");
  });

  it("en Explorar muestra 'Ver N publicaciones nuevas' con las caras al recibir explore:new y recarga al tocarlo (S4-15)", async () => {
    const user = userEvent.setup();
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    // jsdom no trae matchMedia: sin prefers-reduced-motion, sube con animación
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false })),
    );
    apiFetchClient.mockResolvedValueOnce(page([post("1")])); // explorar inicial
    render(<FeedPage />);
    await waitFor(() =>
      expect(screen.getByText("Publicación 1")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: /publicac.*nueva/i }),
    ).not.toBeInTheDocument();

    act(() => {
      onExploreNew.current?.(newPost("p-new-1", "u2", "Beto"));
    });
    expect(
      screen.getByRole("button", { name: "Ver 1 publicación nueva" }),
    ).toBeInTheDocument();

    // Otra de Beto y una de Carla: dos caras (una por persona) y el plural
    act(() => {
      onExploreNew.current?.(newPost("p-new-2", "u2", "Beto"));
      onExploreNew.current?.(newPost("p-new-3", "u3", "Carla"));
      // Repetida: no cuenta dos veces
      onExploreNew.current?.(newPost("p-new-3", "u3", "Carla"));
    });
    const button = screen.getByRole("button", {
      name: "Ver 3 publicaciones nuevas",
    });
    expect(button).toHaveTextContent("C");
    expect(button).toHaveTextContent("B");
    expect(button.querySelectorAll(".ring-2")).toHaveLength(2);

    // Al tocarlo vuelve a pedir Explorar, sube al inicio y el botón desaparece
    apiFetchClient.mockResolvedValueOnce(
      page([post("p-new-3"), post("p-new-2"), post("p-new-1"), post("1")]),
    );
    await user.click(button);
    await waitFor(() => {
      expect(screen.getByText("Publicación p-new-3")).toBeInTheDocument();
    });
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    expect(
      screen.queryByRole("button", { name: /publicac.*nueva/i }),
    ).not.toBeInTheDocument();
    // Las recién mostradas se resaltan
    expect(
      screen.getByText("Publicación p-new-3").closest(".feed-fresh-post"),
    ).not.toBeNull();
    expect(
      screen.getByText("Publicación 1").closest(".feed-fresh-post"),
    ).toBeNull();
    vi.unstubAllGlobals();
  });

  it("cada pestaña cuenta lo suyo: feed:new para Siguiendo y explore:new para Explorar; las propias no cuentan (S4-15)", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockResolvedValueOnce(page([post("1")])); // explorar inicial
    render(<FeedPage />);
    await waitFor(() =>
      expect(screen.getByText("Publicación 1")).toBeInTheDocument(),
    );
    // Espera a /api/auth/me para conocer el usuario actual (u1)
    await waitFor(() =>
      expect(apiFetchClient).toHaveBeenCalledWith("/api/users/ana_lopez"),
    );

    act(() => {
      // Una de alguien seguido llega por los dos eventos
      onFeedNew.current?.(newPost("p-seguido", "u2", "Beto"));
      onExploreNew.current?.(newPost("p-seguido", "u2", "Beto"));
      // Una de alguien que no sigo solo llega a Explorar
      onExploreNew.current?.(newPost("p-otro", "u3", "Carla"));
      // La propia nunca cuenta
      onFeedNew.current?.(newPost("p-mia", "u1", "Ana"));
    });
    expect(
      screen.getByRole("button", { name: "Ver 2 publicaciones nuevas" }),
    ).toBeInTheDocument();

    apiFetchClient.mockResolvedValueOnce(page([post("2")])); // siguiendo inicial
    await user.click(screen.getByRole("button", { name: "Siguiendo" }));
    await waitFor(() =>
      expect(screen.getByText("Publicación 2")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Ver 1 publicación nueva" }),
    ).toBeInTheDocument();
  });

  it("si una carga ya trae la publicación avisada, deja de contarla (S4-15)", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockResolvedValueOnce(page([post("1")])); // explorar inicial
    render(<FeedPage />);
    await waitFor(() =>
      expect(screen.getByText("Publicación 1")).toBeInTheDocument(),
    );

    act(() => {
      onFeedNew.current?.(newPost("p-nueva", "u2", "Beto"));
    });
    // Siguiendo se carga por primera vez después del aviso y ya la trae
    apiFetchClient.mockResolvedValueOnce(page([post("p-nueva"), post("2")]));
    await user.click(screen.getByRole("button", { name: "Siguiendo" }));
    await waitFor(() =>
      expect(screen.getByText("Publicación p-nueva")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: /publicac.*nueva/i }),
    ).not.toBeInTheDocument();
  });
});
