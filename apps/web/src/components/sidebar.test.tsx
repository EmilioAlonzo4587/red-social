import { render, screen, waitFor } from "@testing-library/react";
import type { MeDto } from "@red/api-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "./sidebar";

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

describe("Sidebar", () => {
  beforeEach(() => {
    apiFetchClient.mockReset();
    pathname.value = "/feed";
  });

  it("en una ruta pública no se muestra", () => {
    pathname.value = "/login";
    const { container } = render(<Sidebar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("con sesión muestra Inicio, Notificaciones y Mensajes", () => {
    apiFetchClient.mockResolvedValueOnce(ME);
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute(
      "href",
      "/feed",
    );
    expect(
      screen.getByRole("link", { name: "Notificaciones" }),
    ).toHaveAttribute("href", "/notificaciones");
    expect(screen.getByRole("link", { name: "Mensajes" })).toHaveAttribute(
      "href",
      "/chat",
    );
  });

  it("agrega Mi perfil una vez que carga el usuario actual", async () => {
    apiFetchClient.mockResolvedValueOnce(ME);
    render(<Sidebar />);

    expect(
      screen.queryByRole("link", { name: "Mi perfil" }),
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: "Mi perfil" }),
      ).toHaveAttribute("href", "/u/ana_lopez");
    });
  });

  it("si falla pedir el usuario actual, no muestra Mi perfil pero el resto funciona", async () => {
    apiFetchClient.mockRejectedValueOnce(new Error("caído"));
    render(<Sidebar />);

    await waitFor(() => expect(apiFetchClient).toHaveBeenCalled());
    expect(
      screen.queryByRole("link", { name: "Mi perfil" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inicio" })).toBeInTheDocument();
  });

  it("cada ítem tiene su ícono junto al texto, sin cambiar el nombre accesible", async () => {
    apiFetchClient.mockResolvedValueOnce(ME);
    const { container } = render(<Sidebar />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Mi perfil" })).toBeInTheDocument();
    });

    // 4 ítems, 4 íconos: el nombre accesible de cada enlace sigue siendo solo
    // el texto porque el svg lleva aria-hidden.
    expect(container.querySelectorAll("nav > a svg")).toHaveLength(4);
    expect(screen.getByRole("link", { name: "Inicio" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Notificaciones" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mensajes" })).toBeInTheDocument();
  });
});
