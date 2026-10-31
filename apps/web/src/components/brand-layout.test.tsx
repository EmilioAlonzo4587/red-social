import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandLayout } from "./brand-layout";

const PHRASE = "Conecta, comparte y chatea al instante.";

describe("BrandLayout (S4-08)", () => {
  it("muestra el contenido de la página junto a la marca", () => {
    render(
      <BrandLayout>
        <h1>Iniciar sesión</h1>
      </BrandLayout>,
    );
    expect(
      screen.getByRole("heading", { name: "Iniciar sesión" }),
    ).toBeInTheDocument();
    // Una vez en el panel de escritorio y otra en la franja del celular
    expect(screen.getAllByText(PHRASE)).toHaveLength(2);
  });

  it("el panel de escritorio solo se muestra desde lg", () => {
    render(<BrandLayout>contenido</BrandLayout>);
    const [panelPhrase] = screen.getAllByText(PHRASE);
    expect(panelPhrase.closest("div")).toHaveClass("hidden", "lg:flex");
  });

  it("la burbuja del panel y la de la franja del celular enlazan a la portada", () => {
    render(<BrandLayout>contenido</BrandLayout>);
    const links = screen.getAllByRole("link", {
      name: "ChatInit, ir a la portada",
    });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute("href", "/");
  });

  it("las tarjetas decorativas no llegan a los lectores de pantalla", () => {
    render(<BrandLayout mobileHero="tall">contenido</BrandLayout>);
    for (const text of ["Ana López", "Nuevo mensaje"]) {
      for (const el of screen.getAllByText(text)) {
        expect(el.closest("[aria-hidden]")).toHaveAttribute(
          "aria-hidden",
          "true",
        );
      }
    }
  });

  describe("franja del celular (S4-06)", () => {
    function mobileHero(container: HTMLElement) {
      const hero = container.querySelector(".lg\\:hidden");
      if (!(hero instanceof HTMLElement)) throw new Error("sin franja");
      return hero;
    }

    it("se oculta desde lg y el contenido va en una tarjeta blanca redondeada", () => {
      const { container } = render(<BrandLayout>contenido</BrandLayout>);
      expect(mobileHero(container)).toHaveClass("lg:hidden");
      expect(screen.getByText("contenido")).toHaveClass(
        "rounded-t-[28px]",
        "bg-background",
        "lg:rounded-none",
      );
    });

    it("login (mediana): frase, subtítulo y la tarjeta del like", () => {
      const { container } = render(<BrandLayout>contenido</BrandLayout>);
      const hero = mobileHero(container);
      expect(hero).toHaveClass("h-[300px]");
      expect(hero).toHaveTextContent("Publica, sigue y chatea");
      expect(hero).toHaveTextContent("Ana López");
      expect(hero).not.toHaveTextContent("Nuevo mensaje");
    });

    it("registro (compacta): sin subtítulo y con la tarjeta de mensaje", () => {
      const { container } = render(
        <BrandLayout mobileHero="compact">contenido</BrandLayout>,
      );
      const hero = mobileHero(container);
      expect(hero).toHaveClass("h-[236px]");
      expect(hero).not.toHaveTextContent("Publica, sigue y chatea");
      expect(hero).toHaveTextContent("Nuevo mensaje");
      expect(hero).not.toHaveTextContent("Ana López");
    });

    it("portada (alta): las dos tarjetas", () => {
      const { container } = render(
        <BrandLayout mobileHero="tall">contenido</BrandLayout>,
      );
      const hero = mobileHero(container);
      expect(hero).toHaveClass("h-[520px]");
      expect(hero).toHaveTextContent("Ana López");
      expect(hero).toHaveTextContent("Nuevo mensaje");
    });
  });
});
