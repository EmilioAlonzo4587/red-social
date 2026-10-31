import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MediaDto } from "@red/api-types";
import { describe, expect, it } from "vitest";
import { mediaBoxStyle } from "@/lib/media-box";
import { PostMedia } from "./post-media";

const THREE: MediaDto[] = [
  { publicId: "users/u1/a", mediaType: "image", width: 1200, height: 800 },
  { publicId: "users/u1/b", mediaType: "image", width: 800, height: 1600 },
  { publicId: "users/u1/c", mediaType: "image", width: 640, height: 640 },
];

describe("PostMedia y el visor de imágenes (S4-15)", () => {
  it("abre la imagen tocada en un visor y pasa a la siguiente y la anterior", async () => {
    const user = userEvent.setup();
    render(<PostMedia media={THREE} authorName="Ana" />);

    await user.click(
      screen.getByRole("button", {
        name: "Ver imagen 2 de 3 de la publicación de Ana",
      }),
    );

    const dialog = screen.getByRole("dialog", { name: "Imagen 2 de 3" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("2 de 3")).toBeInTheDocument();
    // La imagen grande conserva su texto alternativo (S4-06)
    expect(
      screen.getAllByRole("img", {
        name: "Imagen 2 de 3 de la publicación de Ana",
      }),
    ).toHaveLength(2);
    // El foco entra al visor
    expect(screen.getByRole("button", { name: "Cerrar imagen" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Imagen siguiente" }));
    expect(screen.getByText("3 de 3")).toBeInTheDocument();
    // Desde la última vuelve a la primera
    await user.keyboard("{ArrowRight}");
    expect(screen.getByText("1 de 3")).toBeInTheDocument();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByText("3 de 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Imagen anterior" }));
    expect(screen.getByText("2 de 3")).toBeInTheDocument();
  });

  it("se cierra con Escape y devuelve el foco a la imagen; bloquea el scroll mientras está abierto", async () => {
    const user = userEvent.setup();
    render(<PostMedia media={THREE} authorName="Ana" />);
    const trigger = screen.getByRole("button", {
      name: "Ver imagen 1 de 3 de la publicación de Ana",
    });

    await user.click(trigger);
    expect(document.body.style.overflow).toBe("hidden");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("se cierra con ✕ y con un clic fuera de la imagen, pero no con un clic en la imagen", async () => {
    const user = userEvent.setup();
    render(<PostMedia media={THREE} authorName="Ana" />);
    const trigger = screen.getByRole("button", {
      name: "Ver imagen 3 de 3 de la publicación de Ana",
    });

    await user.click(trigger);
    const dialog = screen.getByRole("dialog");
    const bigImage = dialog.querySelector("img");
    expect(bigImage).not.toBeNull();
    fireEvent.click(bigImage as HTMLImageElement);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(dialog);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Cerrar imagen" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("Tab no saca el foco del visor", async () => {
    const user = userEvent.setup();
    render(<PostMedia media={THREE} authorName="Ana" />);
    await user.click(
      screen.getByRole("button", {
        name: "Ver imagen 1 de 3 de la publicación de Ana",
      }),
    );

    const close = screen.getByRole("button", { name: "Cerrar imagen" });
    const next = screen.getByRole("button", { name: "Imagen siguiente" });
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(next).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
  });

  it("con una sola imagen no muestra anterior, siguiente ni contador, y se abre con Enter", async () => {
    const user = userEvent.setup();
    render(<PostMedia media={[THREE[0]]} authorName="Ana" />);

    screen
      .getByRole("button", { name: "Ver imagen de la publicación de Ana" })
      .focus();
    await user.keyboard("{Enter}");

    expect(
      screen.getByRole("dialog", { name: "Imagen ampliada" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Imagen siguiente" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/de 1/)).not.toBeInTheDocument();
  });

  it("sin imágenes no pinta nada", () => {
    const { container } = render(<PostMedia media={[]} authorName="Ana" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("mediaBoxStyle (S4-15)", () => {
  it("usa la proporción real y no pasa del ancho real ni del alto máximo", () => {
    expect(
      mediaBoxStyle({ width: 800, height: 1600 }, "100%", "32rem"),
    ).toEqual({
      width: "min(100%, calc(32rem * 0.5), 800px)",
      aspectRatio: "800 / 1600",
    });
  });

  it("sin medidas usa 4:3 sin tope de ancho real", () => {
    expect(mediaBoxStyle({ width: 0, height: 0 }, "92vw", "85dvh")).toEqual({
      width: `min(92vw, calc(85dvh * ${4 / 3}))`,
      aspectRatio: "4 / 3",
    });
  });
});
