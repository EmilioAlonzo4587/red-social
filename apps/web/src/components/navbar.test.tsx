import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Navbar } from "./navbar";

const { pathname } = vi.hoisted(() => ({ pathname: { value: "/feed" } }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
}));

const { apiFetchClient } = vi.hoisted(() => ({ apiFetchClient: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetchClient }));

describe("Navbar", () => {
  beforeEach(() => {
    apiFetchClient.mockReset();
    pathname.value = "/feed";
  });

  it("en una ruta pública, la marca lleva a la portada y no hay buscador", () => {
    pathname.value = "/login";
    render(<Navbar />);
    expect(screen.getByRole("link", { name: "ChatInit" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("con sesión, la marca lleva al feed y no pide /api/auth/me (S4-09: ya no muestra la cuenta)", () => {
    render(<Navbar />);
    expect(screen.getByRole("link", { name: "ChatInit" })).toHaveAttribute(
      "href",
      "/feed",
    );
    expect(apiFetchClient).not.toHaveBeenCalled();
  });
});
