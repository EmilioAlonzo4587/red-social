import { act, fireEvent, render, screen } from "@testing-library/react";
import type { UserSummaryDto } from "@red/api-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-error";
import { SEARCH_DEBOUNCE_MS, UserSearch } from "./user-search";

const { apiFetchClient } = vi.hoisted(() => ({ apiFetchClient: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetchClient }));

function user(username: string, displayName: string | null): UserSummaryDto {
  return { id: `id-${username}`, username, displayName, avatarPublicId: null };
}

// Con temporizadores falsos se usa fireEvent y no user-event: user-event espera sus propios
// temporizadores y la prueba se queda colgada.
function setup() {
  render(<UserSearch />);
  const input = screen.getByRole("searchbox", { name: "Buscar personas" });
  return {
    input,
    type: (value: string) => fireEvent.change(input, { target: { value } }),
  };
}

// Avanza el reloj y resuelve las promesas pendientes (la respuesta simulada de la api)
async function advance(ms = SEARCH_DEBOUNCE_MS) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("UserSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiFetchClient.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("espera 300 ms después de la última tecla y busca una sola vez", async () => {
    apiFetchClient.mockResolvedValue([]);
    const { type } = setup();

    type("a");
    type("an");
    await advance(SEARCH_DEBOUNCE_MS - 1);
    type("ana");
    await advance(SEARCH_DEBOUNCE_MS - 1);
    expect(apiFetchClient).not.toHaveBeenCalled();

    await advance(1);
    expect(apiFetchClient).toHaveBeenCalledTimes(1);
    expect(apiFetchClient).toHaveBeenCalledWith("/api/users/search?q=ana");
  });

  it("no busca con menos de 2 caracteres sin contar espacios (RN14)", async () => {
    const { type } = setup();

    type("  a  ");
    await advance();

    expect(apiFetchClient).not.toHaveBeenCalled();
    expect(screen.queryByText("Buscando…")).not.toBeInTheDocument();
  });

  it("recorta los espacios y codifica el texto en la URL", async () => {
    apiFetchClient.mockResolvedValue([]);
    const { type } = setup();

    type(" ana&luis ");
    await advance();

    expect(apiFetchClient).toHaveBeenCalledWith(
      "/api/users/search?q=ana%26luis",
    );
  });

  it("muestra cada resultado con su avatar y enlaza al perfil", async () => {
    apiFetchClient.mockResolvedValue([
      user("ana_lopez", "Ana López"),
      user("anabel", null),
    ]);
    const { type } = setup();

    type("ana");
    expect(screen.getByText("Buscando…")).toBeInTheDocument();
    await advance();

    expect(screen.getByRole("link", { name: /Ana López/ })).toHaveAttribute(
      "href",
      "/u/ana_lopez",
    );
    expect(screen.getByText("@ana_lopez")).toBeInTheDocument();
    expect(screen.getByText("AL")).toBeInTheDocument();
    // Sin displayName, el nombre sale del username
    expect(screen.getByRole("link", { name: /anabel/ })).toHaveAttribute(
      "href",
      "/u/anabel",
    );
  });

  it("al elegir un resultado cierra la lista y limpia el campo", async () => {
    apiFetchClient.mockResolvedValue([user("ana_lopez", "Ana López")]);
    const { input, type } = setup();

    type("ana");
    await advance();
    fireEvent.click(screen.getByRole("link", { name: /Ana López/ }));

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("estado vacío cuando nadie coincide", async () => {
    apiFetchClient.mockResolvedValue([]);
    const { type } = setup();

    type("zzz");
    await advance();

    expect(screen.getByText("Nadie coincide con “zzz”.")).toBeInTheDocument();
  });

  it("muestra un mensaje si la api falla, sin el texto técnico", async () => {
    apiFetchClient.mockRejectedValue(
      new ApiError(
        {
          statusCode: 500,
          error: "Internal Server Error",
          message: "Error interno",
          details: [],
        },
        500,
      ),
    );
    const { type } = setup();

    type("ana");
    await advance();

    expect(
      screen.getByText("No se pudo buscar. Intenta de nuevo."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Error interno")).not.toBeInTheDocument();
  });

  it("una respuesta vieja que llega tarde no pisa la búsqueda nueva", async () => {
    let resolveOld: (users: UserSummaryDto[]) => void = () => {};
    apiFetchClient
      .mockReturnValueOnce(
        new Promise<UserSummaryDto[]>((resolve) => {
          resolveOld = resolve;
        }),
      )
      .mockResolvedValueOnce([user("beto", "Beto")]);
    const { type } = setup();

    type("an");
    await advance();
    type("be");
    await advance();
    await act(async () => {
      resolveOld([user("ana_lopez", "Ana López")]);
      await Promise.resolve();
    });

    expect(screen.getByRole("link", { name: /Beto/ })).toBeInTheDocument();
    expect(screen.queryByText("Ana López")).not.toBeInTheDocument();
  });

  it("Escape y un click fuera cierran la lista", async () => {
    apiFetchClient.mockResolvedValue([user("ana_lopez", "Ana López")]);
    const { input, type } = setup();

    type("ana");
    await advance();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    fireEvent.focus(input);
    expect(screen.getByRole("link", { name: /Ana López/ })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
