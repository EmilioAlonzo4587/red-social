import { render, screen, waitFor } from "@testing-library/react";
import type { MeDto } from "@red/api-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Navbar } from "./navbar";

const { pathname } = vi.hoisted(() => ({ pathname: { value: "/feed" } }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
}));

const { apiFetchClient } = vi.hoisted(() => ({ apiFetchClient: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetchClient }));

const ME: MeDto = {
  id: "u1",
  username: "ana_lopez",
  displayName: "Ana López",
  avatarPublicId: null,
  email: "ana@example.com",
  bio: null,
  createdAt: "2026-10-01T00:00:00.000Z",
};

describe("Navbar", () => {
  beforeEach(() => {
    apiFetchClient.mockReset();
    pathname.value = "/feed";
  });

  it("en una ruta pública no pide /api/auth/me ni muestra la tarjeta de cuenta", () => {
    pathname.value = "/login";
    render(<Navbar />);
    expect(apiFetchClient).not.toHaveBeenCalled();
    expect(screen.queryByText("@ana_lopez")).not.toBeInTheDocument();
  });

  it("con sesión, muestra tu cuenta en la esquina superior derecha", async () => {
    apiFetchClient.mockResolvedValueOnce(ME);
    render(<Navbar />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Ana López/ })).toHaveAttribute(
        "href",
        "/u/ana_lopez",
      );
    });
    expect(screen.getByText("@ana_lopez")).toBeInTheDocument();
  });

  it("si falla GET /api/auth/me, no muestra la tarjeta pero el resto del Navbar funciona", async () => {
    apiFetchClient.mockRejectedValueOnce(new Error("caído"));
    render(<Navbar />);

    await waitFor(() => expect(apiFetchClient).toHaveBeenCalled());
    expect(screen.queryByText("@ana_lopez")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ChatInit" })).toHaveAttribute(
      "href",
      "/feed",
    );
  });
});
