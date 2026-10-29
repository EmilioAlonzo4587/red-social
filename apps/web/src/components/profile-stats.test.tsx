import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FollowStatusDto } from "@red/api-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileStats } from "./profile-stats";

const { apiFetchClient } = vi.hoisted(() => ({ apiFetchClient: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetchClient }));

const BASE_PROPS = {
  username: "ana_lopez",
  isOwnProfile: false,
  postCount: 5,
  followingCount: 3,
  initialFollowerCount: 10,
  initialIsFollowing: false,
};

describe("ProfileStats", () => {
  beforeEach(() => {
    apiFetchClient.mockReset();
  });

  it("muestra los contadores iniciales", () => {
    render(<ProfileStats {...BASE_PROPS} />);
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("en el perfil propio muestra Editar perfil en vez de Seguir/Mensaje", () => {
    render(<ProfileStats {...BASE_PROPS} isOwnProfile />);
    expect(
      screen.getByRole("link", { name: "Editar perfil" }),
    ).toHaveAttribute("href", "/perfil/editar");
    expect(
      screen.queryByRole("button", { name: "Seguir" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mensaje" }),
    ).not.toBeInTheDocument();
  });

  it("en un perfil ajeno muestra Seguir y Mensaje", () => {
    render(<ProfileStats {...BASE_PROPS} />);
    expect(screen.getByRole("button", { name: "Seguir" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mensaje" }),
    ).toBeInTheDocument();
  });

  it("seguir llama PUT y actualiza el botón y el contador", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockResolvedValueOnce({
      isFollowing: true,
      followerCount: 11,
    } satisfies FollowStatusDto);

    render(<ProfileStats {...BASE_PROPS} />);
    await user.click(screen.getByRole("button", { name: "Seguir" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Siguiendo" }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(apiFetchClient).toHaveBeenCalledWith(
      "/api/users/ana_lopez/follow",
      { method: "PUT" },
    );
  });

  it("dejar de seguir llama DELETE y actualiza el botón y el contador", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockResolvedValueOnce({
      isFollowing: false,
      followerCount: 9,
    } satisfies FollowStatusDto);

    render(<ProfileStats {...BASE_PROPS} initialIsFollowing />);
    await user.click(screen.getByRole("button", { name: "Siguiendo" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Seguir" }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(apiFetchClient).toHaveBeenCalledWith(
      "/api/users/ana_lopez/follow",
      { method: "DELETE" },
    );
  });

  it("si la api falla, el botón se queda como estaba", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockRejectedValueOnce(new Error("caído"));

    render(<ProfileStats {...BASE_PROPS} />);
    await user.click(screen.getByRole("button", { name: "Seguir" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Seguir" })).toBeEnabled();
    });
    expect(screen.getByText("10")).toBeInTheDocument();
  });
});
