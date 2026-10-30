import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserSummaryDto, UserSummaryPageDto } from "@red/api-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-error";
import { FollowListModal } from "./follow-list-modal";

const { apiFetchClient } = vi.hoisted(() => ({ apiFetchClient: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetchClient }));

function user(id: string, username: string): UserSummaryDto {
  return {
    id,
    username,
    displayName: `Nombre ${username}`,
    avatarPublicId: null,
  };
}

function page(
  items: UserSummaryDto[],
  nextCursor: string | null = null,
): UserSummaryPageDto {
  return { items, nextCursor };
}

describe("FollowListModal", () => {
  beforeEach(() => {
    apiFetchClient.mockReset();
  });

  it("pide la lista correcta según kind", async () => {
    apiFetchClient.mockResolvedValueOnce(page([]));
    render(
      <FollowListModal username="ana_lopez" kind="followers" onClose={vi.fn()} />,
    );

    await waitFor(() => {
      expect(apiFetchClient).toHaveBeenCalledWith(
        "/api/users/ana_lopez/followers",
      );
    });
  });

  it("muestra cada fila con avatar, nombre y username, enlazando al perfil", async () => {
    apiFetchClient.mockResolvedValueOnce(page([user("u1", "carlos_mendez")]));
    render(
      <FollowListModal username="ana_lopez" kind="followers" onClose={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Nombre carlos_mendez")).toBeInTheDocument();
    });
    expect(screen.getByText("@carlos_mendez")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Nombre carlos_mendez/ }),
    ).toHaveAttribute("href", "/u/carlos_mendez");
  });

  it("estado vacío para seguidores", async () => {
    apiFetchClient.mockResolvedValueOnce(page([]));
    render(
      <FollowListModal username="ana_lopez" kind="followers" onClose={vi.fn()} />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Todavía no tiene seguidores."),
      ).toBeInTheDocument();
    });
  });

  it("estado vacío para seguidos", async () => {
    apiFetchClient.mockResolvedValueOnce(page([]));
    render(
      <FollowListModal username="ana_lopez" kind="following" onClose={vi.fn()} />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Todavía no sigue a nadie."),
      ).toBeInTheDocument();
    });
  });

  it("Cargar más pide la siguiente página con el cursor y agrega usuarios", async () => {
    const clickUser = userEvent.setup();
    apiFetchClient.mockResolvedValueOnce(page([user("u1", "carlos")], "cursor-1"));
    render(
      <FollowListModal username="ana_lopez" kind="followers" onClose={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByText("@carlos")).toBeInTheDocument());

    apiFetchClient.mockResolvedValueOnce(page([user("u2", "luisa")], null));
    await clickUser.click(screen.getByRole("button", { name: "Cargar más" }));

    await waitFor(() => {
      expect(apiFetchClient).toHaveBeenCalledWith(
        "/api/users/ana_lopez/followers?cursor=cursor-1",
      );
    });
    expect(screen.getByText("@luisa")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cargar más" }),
    ).not.toBeInTheDocument();
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
    render(
      <FollowListModal username="ana_lopez" kind="followers" onClose={vi.fn()} />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Error interno del servidor"),
      ).toBeInTheDocument();
    });
  });

  it("el botón Cerrar llama a onClose", async () => {
    const clickUser = userEvent.setup();
    const onClose = vi.fn();
    apiFetchClient.mockResolvedValueOnce(page([]));
    render(
      <FollowListModal username="ana_lopez" kind="followers" onClose={onClose} />,
    );
    await waitFor(() => expect(apiFetchClient).toHaveBeenCalled());

    await clickUser.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("tocar el fondo llama a onClose", async () => {
    const clickUser = userEvent.setup();
    const onClose = vi.fn();
    apiFetchClient.mockResolvedValueOnce(page([]));
    render(
      <FollowListModal username="ana_lopez" kind="followers" onClose={onClose} />,
    );
    await waitFor(() => expect(apiFetchClient).toHaveBeenCalled());

    await clickUser.click(screen.getByRole("dialog", { name: "Seguidores" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("la tecla Escape llama a onClose", async () => {
    const clickUser = userEvent.setup();
    const onClose = vi.fn();
    apiFetchClient.mockResolvedValueOnce(page([]));
    render(
      <FollowListModal username="ana_lopez" kind="followers" onClose={onClose} />,
    );
    await waitFor(() => expect(apiFetchClient).toHaveBeenCalled());

    await clickUser.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
