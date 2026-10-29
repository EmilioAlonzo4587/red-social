import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Navbar } from "./navbar";

const { pathname } = vi.hoisted(() => ({ pathname: { value: "/feed" } }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
}));

const { logout } = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ logout }));

describe("Navbar", () => {
  beforeEach(() => {
    logout.mockReset();
    pathname.value = "/feed";
  });

  it("en una ruta pública no muestra el botón de cerrar sesión", () => {
    pathname.value = "/login";
    render(<Navbar />);
    expect(
      screen.queryByRole("button", { name: "Cerrar sesión" }),
    ).not.toBeInTheDocument();
  });

  it("con sesión activa muestra el botón de cerrar sesión", () => {
    render(<Navbar />);
    expect(
      screen.getByRole("button", { name: "Cerrar sesión" }),
    ).toBeInTheDocument();
  });

  it("al tocarlo llama a logout()", async () => {
    const user = userEvent.setup();
    logout.mockResolvedValueOnce(undefined);
    render(<Navbar />);

    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("no deja volver a tocarlo mientras cierra sesión", async () => {
    const user = userEvent.setup();
    let resolveLogout: () => void = () => {};
    logout.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveLogout = resolve;
      }),
    );
    render(<Navbar />);

    const button = screen.getByRole("button", { name: "Cerrar sesión" });
    await user.click(button);
    expect(button).toBeDisabled();

    resolveLogout();
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });
});
