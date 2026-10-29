"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/lib/api-client";
import { PUBLIC_PATHS } from "@/lib/public-paths";

// Fijo en la esquina inferior izquierda (S3-13): queda disponible en cualquier
// página con sesión, sin depender de la barra lateral que todavía no existe (S3-14).
export function LogoutButton() {
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
      className="fixed bottom-4 left-4 z-20 flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
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
      {loggingOut ? "Cerrando sesión…" : "Cerrar sesión"}
    </button>
  );
}
