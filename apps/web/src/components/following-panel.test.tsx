import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserSummaryDto, UserSummaryPageDto } from "@red/api-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FOLLOWING_PANEL_LIMIT, FollowingPanel } from "./following-panel";

const { apiFetchClient } = vi.hoisted(() => ({ apiFetchClient: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetchClient }));

function user(n: number): UserSummaryDto {
  return {
    id: `u${n}`,
    username: `persona_${n}`,
    displayName: `Persona ${n}`,
    avatarPublicId: null,
  };
}

function page(
  items: UserSummaryDto[],
  nextCursor: string | null = null,
): UserSummaryPageDto {
  return { items, nextCursor };
}

describe("FollowingPanel", () => {
  beforeEach(() => {
    apiFetchClient.mockReset();
  });

  it("caso feliz: muestra a quienes sigues, enlazando a su perfil", async () => {
    apiFetchClient.mockResolvedValueOnce(page([user(1), user(2)]));
    render(<FollowingPanel username="ana_lopez" />);

    await waitFor(() => {
      expect(screen.getByText("Persona 1")).toBeInTheDocument();
    });
    expect(apiFetchClient).toHaveBeenCalledWith(
      "/api/users/ana_lopez/following",
    );
    expect(screen.getByRole("link", { name: /Persona 2/ })).toHaveAttribute(
      "href",
      "/u/persona_2",
    );
    expect(
      screen.queryByRole("button", { name: "Ver todos" }),
    ).not.toBeInTheDocument();
  });

  it(`muestra como máximo ${FOLLOWING_PANEL_LIMIT} y, si hay más, "Ver todos" abre el modal`, async () => {
    const many = Array.from({ length: 15 }, (_, i) => user(i + 1));
    apiFetchClient
      .mockResolvedValueOnce(page(many))
      .mockResolvedValueOnce(page(many));
    render(<FollowingPanel username="ana_lopez" />);

    await waitFor(() => {
      expect(screen.getAllByRole("listitem")).toHaveLength(
        FOLLOWING_PANEL_LIMIT,
      );
    });

    await userEvent.setup().click(
      screen.getByRole("button", { name: "Ver todos" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Seguidos" }),
    ).toBeInTheDocument();
  });

  it('"Ver todos" también aparece si la api indica otra página', async () => {
    apiFetchClient.mockResolvedValueOnce(page([user(1)], "cursor-2"));
    render(<FollowingPanel username="ana_lopez" />);

    expect(
      await screen.findByRole("button", { name: "Ver todos" }),
    ).toBeInTheDocument();
  });

  it("si no sigues a nadie, muestra el estado vacío", async () => {
    apiFetchClient.mockResolvedValueOnce(page([]));
    render(<FollowingPanel username="ana_lopez" />);

    expect(
      await screen.findByText(/Todavía no sigues a nadie/),
    ).toBeInTheDocument();
  });

  it("si la api falla, avisa sin romper la columna", async () => {
    apiFetchClient.mockRejectedValueOnce(new Error("caído"));
    render(<FollowingPanel username="ana_lopez" />);

    expect(
      await screen.findByText("No se pudo cargar la lista."),
    ).toBeInTheDocument();
  });
});
