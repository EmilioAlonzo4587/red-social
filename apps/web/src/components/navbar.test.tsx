import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Navbar } from "./navbar";

const { pathname } = vi.hoisted(() => ({ pathname: { value: "/feed" } }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
  // UserSearch (dentro de Navbar) navega con el router al elegir con Enter (S4-16)
  useRouter: () => ({ push: vi.fn() }),
}));

const { apiFetchClient } = vi.hoisted(() => ({ apiFetchClient: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetchClient }));

describe("Navbar", () => {
  beforeEach(() => {
    apiFetchClient.mockReset();
    pathname.value = "/feed";
  });

  it.each(["/", "/login", "/registro"])(
    "en %s no se muestra (S4-08: la marca va en el panel de BrandLayout)",
    (route) => {
      pathname.value = route;
      const { container } = render(<Navbar />);
      expect(container).toBeEmptyDOMElement();
    },
  );

  it("con sesión, la marca lleva al feed y no pide /api/auth/me (S4-09: ya no muestra la cuenta)", () => {
    render(<Navbar />);
    expect(screen.getByRole("link", { name: "ChatInit" })).toHaveAttribute(
      "href",
      "/feed",
    );
    expect(apiFetchClient).not.toHaveBeenCalled();
  });
});
