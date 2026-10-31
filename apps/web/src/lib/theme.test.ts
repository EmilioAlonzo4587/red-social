import { afterEach, describe, expect, it } from "vitest";
import {
  applyThemePreference,
  DEFAULT_THEME,
  parseThemePreference,
  THEME_COOKIE,
} from "./theme";

describe("theme (S4-13)", () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
    document.cookie = `${THEME_COOKIE}=; Max-Age=0; Path=/`;
  });

  it("acepta las tres preferencias guardadas", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("system")).toBe("system");
  });

  it("sin cookie o con un valor desconocido, usa Automático", () => {
    expect(DEFAULT_THEME).toBe("system");
    expect(parseThemePreference(undefined)).toBe("system");
    expect(parseThemePreference("rosa")).toBe("system");
  });

  it("aplicar un tema cambia data-theme en <html> y lo guarda en la cookie", () => {
    applyThemePreference("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.cookie).toContain(`${THEME_COOKIE}=dark`);
  });
});
