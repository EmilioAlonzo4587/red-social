import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RecentReactionsDto } from "@red/api-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecentReactions } from "./recent-reactions";

const { apiFetchClient } = vi.hoisted(() => ({ apiFetchClient: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetchClient }));

const POST_ID = "11111111-1111-1111-1111-111111111111";

const RECENT: RecentReactionsDto = {
  total: 7,
  items: [
    {
      user: {
        id: "u2",
        username: "beto",
        displayName: "Beto Ramírez",
        avatarPublicId: null,
      },
      reaction: "love",
      createdAt: new Date().toISOString(),
    },
    {
      user: {
        id: "u3",
        username: "carla",
        displayName: null,
        avatarPublicId: null,
      },
      reaction: "haha",
      createdAt: new Date().toISOString(),
    },
  ],
};

function renderCounter() {
  render(
    <div className="relative">
      <RecentReactions
        postId={POST_ID}
        likeCount={7}
        topReactions={["love", "haha"]}
      />
      <button type="button">Afuera</button>
    </div>,
  );
  return screen.getByRole("button", {
    name: "7 reacciones: Me encanta, Me divierte. Ver quién reaccionó",
  });
}

describe("RecentReactions (S4-16)", () => {
  beforeEach(() => {
    apiFetchClient.mockReset();
  });

  it("al tocar el contador muestra las reacciones recientes con quién, qué y enlace al perfil", async () => {
    const user = userEvent.setup();
    let resolve: (value: RecentReactionsDto) => void = () => {};
    apiFetchClient.mockReturnValueOnce(
      new Promise<RecentReactionsDto>((done) => {
        resolve = done;
      }),
    );
    const counter = renderCounter();
    expect(counter).toHaveAttribute("aria-expanded", "false");

    await user.click(counter);
    expect(counter).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("dialog", { name: "Reacciones recientes" });
    expect(panel).toHaveTextContent("Cargando…");
    expect(apiFetchClient).toHaveBeenCalledWith(
      `/api/posts/${POST_ID}/reactions`,
    );
    resolve(RECENT);

    await waitFor(() =>
      expect(screen.getByText("Beto Ramírez")).toBeInTheDocument(),
    );
    expect(panel).toHaveTextContent("7 en total");
    expect(screen.getByRole("img", { name: "Me encanta" })).toHaveTextContent(
      "❤️",
    );
    expect(screen.getByRole("link", { name: /Beto Ramírez/ })).toHaveAttribute(
      "href",
      "/u/beto",
    );
    // Sin nombre visible, muestra el usuario
    expect(screen.getByRole("link", { name: /carla/ })).toHaveAttribute(
      "href",
      "/u/carla",
    );
  });

  it("se cierra con el mismo botón, con Escape (devuelve el foco) y con un clic fuera; cada apertura vuelve a pedir", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockResolvedValue(RECENT);
    const counter = renderCounter();

    await user.click(counter);
    await user.click(counter);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(counter);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(counter).toHaveFocus();

    await user.click(counter);
    await user.click(screen.getByRole("button", { name: "Afuera" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(apiFetchClient).toHaveBeenCalledTimes(3);
  });

  it("se abre hacia arriba si abajo no hay espacio (barra inferior del celular)", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockResolvedValue(RECENT);
    const counter = renderCounter();

    await user.click(counter);
    expect(screen.getByRole("dialog")).toHaveClass("top-full");
    await user.click(counter);

    // El contador queda a 100px del borde inferior de la pantalla
    vi.spyOn(counter, "getBoundingClientRect").mockReturnValue({
      bottom: window.innerHeight - 100,
    } as DOMRect);
    await user.click(counter);
    expect(screen.getByRole("dialog")).toHaveClass("bottom-full");
  });

  it("estado vacío sin reacciones", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockResolvedValueOnce({ total: 0, items: [] });
    await user.click(renderCounter());
    expect(
      await screen.findByText("Todavía nadie reaccionó."),
    ).toBeInTheDocument();
  });

  it("si la api falla, lo dice", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockRejectedValueOnce(new Error("caída"));
    await user.click(renderCounter());
    expect(
      await screen.findByText("No se pudieron cargar las reacciones."),
    ).toBeInTheDocument();
  });
});
