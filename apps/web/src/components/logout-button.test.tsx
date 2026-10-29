import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LogoutButton } from "./logout-button";

const { pathname } = vi.hoisted(() => ({ pathname: { value: "/feed" } }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
}));

const { logout } = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ logout }));

describe("LogoutButton", () => {
  beforeEach(() => {
    logout.mockReset();
    pathname.value = "/feed";
  });

  it("en una ruta pública no se muestra", () => {
    pathname.value = "/login";
    render(<LogoutButton />);
    expect(
      screen.queryByRole("button", { name: "Cerrar sesión" }),
    ).not.toBeInTheDocument();
  });

  it("con sesión activa se muestra con el texto Cerrar sesión", () => {
    render(<LogoutButton />);
    expect(
      screen.getByRole("button", { name: "Cerrar sesión" }),
    ).toBeInTheDocument();
  });

  it("al tocarlo llama a logout()", async () => {
    const user = userEvent.setup();
    logout.mockResolvedValueOnce(undefined);
    render(<LogoutButton />);

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
    render(<LogoutButton />);

    const button = screen.getByRole("button", { name: "Cerrar sesión" });
    await user.click(button);
    expect(button).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Cerrando sesión…" }),
    ).toBeInTheDocument();

    resolveLogout();
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });
});
