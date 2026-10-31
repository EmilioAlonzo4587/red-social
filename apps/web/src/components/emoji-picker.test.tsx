import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EMOJI_GROUPS, EmojiPicker, EmojiToggleButton } from "./emoji-picker";

describe("EmojiPicker (S4-10)", () => {
  it("muestra los 32 emojis predeterminados en dos grupos", () => {
    render(<EmojiPicker id="picker" onPick={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("Caras")).toBeInTheDocument();
    expect(screen.getByText("Gestos y símbolos")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /^Insertar / }),
    ).toHaveLength(32);
    expect(EMOJI_GROUPS.flatMap((g) => g.emojis)).toHaveLength(32);
  });

  it("al elegir un emoji avisa cuál fue", async () => {
    const onPick = vi.fn();
    render(<EmojiPicker id="picker" onPick={onPick} onClose={vi.fn()} />);
    await userEvent.setup().click(
      screen.getByRole("button", { name: "Insertar corazón verde" }),
    );
    expect(onPick).toHaveBeenCalledWith("💚");
  });

  it("Escape dentro del panel lo cierra", () => {
    const onClose = vi.fn();
    render(<EmojiPicker id="picker" onPick={vi.fn()} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Insertar fiesta" }), {
      key: "Escape",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("los emojis no se repiten", () => {
    const all = EMOJI_GROUPS.flatMap((g) => g.emojis.map((e) => e.emoji));
    expect(new Set(all).size).toBe(all.length);
  });

  it("Escape no llega al formulario que lo contiene (no cierra el recuadro de comentario)", () => {
    const onFormKey = vi.fn();
    render(
      <form onKeyDown={onFormKey}>
        <EmojiPicker id="picker" onPick={vi.fn()} onClose={vi.fn()} />
      </form>,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "Insertar fiesta" }), {
      key: "Escape",
    });
    expect(onFormKey).not.toHaveBeenCalled();
  });

  it("el botón de la carita indica si el panel está abierto", () => {
    const { rerender } = render(
      <EmojiToggleButton open={false} onToggle={vi.fn()} controls="picker" />,
    );
    const closed = screen.getByRole("button", { name: "Abrir emojis" });
    expect(closed).toHaveAttribute("aria-expanded", "false");
    expect(closed).not.toHaveAttribute("aria-controls");

    rerender(<EmojiToggleButton open onToggle={vi.fn()} controls="picker" />);
    const open = screen.getByRole("button", { name: "Cerrar emojis" });
    expect(open).toHaveAttribute("aria-expanded", "true");
    expect(open).toHaveAttribute("aria-controls", "picker");
  });
});
