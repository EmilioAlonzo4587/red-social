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
      className="fixed bottom-4 left-4 z-20 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loggingOut ? "Cerrando sesión…" : "Cerrar sesión"}
    </button>
  );
}
