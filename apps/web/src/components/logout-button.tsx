"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/lib/api-client";
import { PUBLIC_PATHS } from "@/lib/public-paths";

// "floating": fijo en la esquina inferior izquierda (S3-13), solo desde `sm`, en z-40 para
// quedar sobre la barra lateral (z-30 y con fondo desde S4-11, que lo tapaba); en el
// celular estorbaba sobre el contenido. "icon": ícono en la esquina superior derecha
// del Navbar, solo en el celular (S4-06), donde abajo va la barra de navegación.
const VARIANT_CLASSES = {
  floating:
    "fixed bottom-4 left-4 z-40 hidden items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50 sm:flex",
  icon: "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted outline-primary hover:bg-surface hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 sm:hidden",
};

export function LogoutButton({
  variant = "floating",
}: {
  variant?: "floating" | "icon";
}) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.includes(pathname);
  const [loggingOut, setLoggingOut] = useState(false);

  if (isPublic) return null;

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    await logout();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loggingOut}
      aria-label={
        variant === "icon"
          ? loggingOut
            ? "Cerrando sesión…"
            : "Cerrar sesión"
          : undefined
      }
      className={VARIANT_CLASSES[variant]}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
        className="h-5 w-5"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M18 12H9m9 0l-3-3m3 3l-3 3"
        />
      </svg>
      {variant === "floating" &&
        (loggingOut ? "Cerrando sesión…" : "Cerrar sesión")}
    </button>
  );
}
