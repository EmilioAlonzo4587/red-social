import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LogoutButton } from "@/components/logout-button";
import { Navbar } from "@/components/navbar";
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
        <Navbar />
        {children}
        <LogoutButton />
      </body>
    </html>
  );
}
