import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandLayout } from "./brand-layout";

describe("BrandLayout (S4-08)", () => {
  it("muestra el contenido de la página junto al panel de marca", () => {
    render(
      <BrandLayout>
        <h1>Iniciar sesión</h1>
      </BrandLayout>,
    );
    expect(
      screen.getByRole("heading", { name: "Iniciar sesión" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Conecta, comparte y chatea al instante."),
    ).toBeInTheDocument();
  });

  it("la burbuja del panel enlaza a la portada", () => {
    render(<BrandLayout>contenido</BrandLayout>);
    expect(
      screen.getByRole("link", { name: "ChatInit, ir a la portada" }),
    ).toHaveAttribute("href", "/");
  });

  it("el panel se oculta en pantallas angostas (solo se muestra desde lg)", () => {
    render(<BrandLayout>contenido</BrandLayout>);
    const panel = screen
      .getByText("Conecta, comparte y chatea al instante.")
      .closest("div");
    expect(panel).toHaveClass("hidden", "lg:flex");
  });

  it("las tarjetas decorativas no llegan a los lectores de pantalla", () => {
    render(<BrandLayout>contenido</BrandLayout>);
    expect(screen.getByText("Ana López").closest("[aria-hidden]")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.getByText("Nuevo mensaje").closest("[aria-hidden]")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("en pantallas angostas deja un enlace a la portada, salvo que se apague", () => {
    const { unmount } = render(<BrandLayout>contenido</BrandLayout>);
    expect(screen.getByRole("link", { name: "ChatInit" })).toHaveAttribute(
      "href",
      "/",
    );
    unmount();

    render(<BrandLayout showMobileBrand={false}>contenido</BrandLayout>);
    expect(
      screen.queryByRole("link", { name: "ChatInit" }),
    ).not.toBeInTheDocument();
  });
});
