import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PasswordInput } from "./password-input";

function Wrapper() {
  const onChange = vi.fn();
  return (
    <PasswordInput
      id="password"
      name="password"
      value="secreta123"
      onChange={onChange}
    />
  );
}

describe("PasswordInput", () => {
  it("empieza oculta (type password)", () => {
    render(<Wrapper />);
    const input = screen.getByDisplayValue("secreta123");
    expect(input).toHaveAttribute("type", "password");
    expect(
      screen.getByRole("button", { name: "Mostrar contraseña" }),
    ).toBeInTheDocument();
  });

  it("al tocar el botón, muestra la contraseña en texto plano", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);

    await user.click(screen.getByRole("button", { name: "Mostrar contraseña" }));

    const input = screen.getByDisplayValue("secreta123");
    expect(input).toHaveAttribute("type", "text");
    expect(
      screen.getByRole("button", { name: "Ocultar contraseña" }),
    ).toBeInTheDocument();
  });

  it("al tocarlo de nuevo, la vuelve a ocultar", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);

    const toggle = screen.getByRole("button", { name: "Mostrar contraseña" });
    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: "Ocultar contraseña" }));

    expect(screen.getByDisplayValue("secreta123")).toHaveAttribute(
      "type",
      "password",
    );
  });

  it("anuncia el estado con aria-pressed", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);

    const toggle = screen.getByRole("button", { name: "Mostrar contraseña" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);
    expect(
      screen.getByRole("button", { name: "Ocultar contraseña" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
