import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { BfcacheReload } from "@/components/bfcache-reload";
import { LogoutButton } from "@/components/logout-button";
import { Navbar } from "@/components/navbar";
import { Sidebar } from "@/components/sidebar";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={inter.variable}>
      <body>
        <BfcacheReload />
        <Navbar />
        <div className="flex">
          <Sidebar />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
        <LogoutButton />
      </body>
    </html>
  );
}
