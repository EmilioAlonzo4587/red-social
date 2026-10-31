import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { THEME_COOKIE } from "@/lib/theme";
import { AppearanceSettings } from "./appearance-settings";

function option(name: RegExp | string) {
  return screen.getByRole("radio", { name });
}

describe("AppearanceSettings (S4-13)", () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
    document.cookie = `${THEME_COOKIE}=; Max-Age=0; Path=/`;
  });

  it("muestra Claro, Oscuro y Automático como un grupo de radios, con la preferencia marcada", () => {
    render(<AppearanceSettings initialPreference="system" />);
    expect(
      screen.getByRole("radiogroup", { name: "Apariencia" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(option(/Automático/)).toHaveAttribute("aria-checked", "true");
    expect(option("Claro")).toHaveAttribute("aria-checked", "false");
    // Solo la elegida entra en el recorrido con Tab
    expect(option(/Automático/)).toHaveAttribute("tabindex", "0");
    expect(option("Oscuro")).toHaveAttribute("tabindex", "-1");
  });

  it.each([
    ["Claro", "light"],
    ["Oscuro", "dark"],
    [/Automático/, "system"],
  ] as const)("elegir %s lo aplica al instante y lo guarda", async (name, value) => {
    const user = userEvent.setup();
    render(
      <AppearanceSettings
        initialPreference={value === "light" ? "dark" : "light"}
      />,
    );

    await user.click(option(name));

    expect(option(name)).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.dataset.theme).toBe(value);
    expect(document.cookie).toContain(`${THEME_COOKIE}=${value}`);
    expect(screen.getByRole("status")).toHaveTextContent(/Tema:/);
  });

  it("las flechas cambian de opción y la aplican, dando la vuelta al final", () => {
    render(<AppearanceSettings initialPreference="light" />);

    fireEvent.keyDown(option("Claro"), { key: "ArrowRight" });
    expect(option("Oscuro")).toHaveAttribute("aria-checked", "true");
    expect(option("Oscuro")).toHaveFocus();
    expect(document.documentElement.dataset.theme).toBe("dark");

    fireEvent.keyDown(option("Oscuro"), { key: "End" });
    expect(option(/Automático/)).toHaveAttribute("aria-checked", "true");

    fireEvent.keyDown(option(/Automático/), { key: "ArrowDown" });
    expect(option("Claro")).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
