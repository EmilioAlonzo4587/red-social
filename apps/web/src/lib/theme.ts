// Tema de la app (S4-13): se guarda por dispositivo en una cookie que el servidor lee en
// layout.tsx para dibujar <html data-theme="..."> desde el primer momento, sin un
// parpadeo en blanco. No es un dato de sesión ni viaja a la api: es solo apariencia.
export const THEME_COOKIE = "chatinit_theme";

export const THEME_PREFERENCES = ["light", "dark", "system"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

// "system" (Automático) sigue el modo del dispositivo y es la opción por defecto
export const DEFAULT_THEME: ThemePreference = "system";

// Un año: la preferencia dura aunque se cierre sesión o el navegador
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function parseThemePreference(value: string | undefined): ThemePreference {
  return THEME_PREFERENCES.find((preference) => preference === value) ?? DEFAULT_THEME;
}

/**
 * Aplica el tema al instante (cambia data-theme en <html>, del que dependen los colores
 * de globals.css) y lo guarda en la cookie para las próximas visitas.
 */
export function applyThemePreference(preference: ThemePreference): void {
  document.documentElement.dataset.theme = preference;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${THEME_COOKIE}=${preference}; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax${secure}`;
}
