import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BfcacheReload } from "@/components/bfcache-reload";
import { LogoutButton } from "@/components/logout-button";
import { Navbar } from "@/components/navbar";
import { Sidebar } from "@/components/sidebar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ChatInit",
  description: "Publica, sigue, comenta y chatea en tiempo real.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable}`}>
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
