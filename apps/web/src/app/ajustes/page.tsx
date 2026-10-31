import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AppearanceSettings } from "@/components/appearance-settings";
import { parseThemePreference, THEME_COOKIE } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Ajustes · ChatInit",
};

// S4-13: solo con sesión (proxy.ts redirige a la portada sin ella, como toda ruta que no
// está en PUBLIC_PATHS). Deja lugar para más ajustes en el futuro.
export default async function SettingsPage() {
  const preference = parseThemePreference(
    (await cookies()).get(THEME_COOKIE)?.value,
  );

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <h1 className="mb-5 text-xl font-bold">Ajustes</h1>
      <AppearanceSettings initialPreference={preference} />
    </main>
  );
}
