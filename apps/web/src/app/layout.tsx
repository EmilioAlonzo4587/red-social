import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Inter } from "next/font/google";
import { BfcacheReload } from "@/components/bfcache-reload";
import { LogoutButton } from "@/components/logout-button";
import { Navbar } from "@/components/navbar";
import { NotificationToaster } from "@/components/notification-toaster";
import { Sidebar } from "@/components/sidebar";
import { parseThemePreference, THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

// S4-09: la libre más cercana a SF Pro de Apple. Igual que Geist antes, se
// descarga en el build (next/font) y se ve idéntica en cualquier dispositivo.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ChatInit",
  description: "Publica, sigue, comenta y chatea en tiempo real.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // S4-13: el tema elegido en Ajustes llega en una cookie. Se pone en <html> desde el
  // servidor para que la página se dibuje directo en ese tema, sin parpadeo en blanco.
  const theme = parseThemePreference((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html lang="es" className={inter.variable} data-theme={theme}>
      <body>
        <BfcacheReload />
        <Navbar />
        <NotificationToaster />
        {/* Con sesión y bajo `sm`, Sidebar pinta la barra inferior (#mobile-nav, 64px):
            se reserva ese alto para que no tape el final de la página. */}
        <div className="flex has-[#mobile-nav]:pb-16 sm:has-[#mobile-nav]:pb-0">
          <Sidebar />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
        <LogoutButton />
      </body>
    </html>
  );
}
