"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/lib/api-client";
import { PUBLIC_PATHS } from "@/lib/public-paths";

export function Navbar() {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.includes(pathname);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    await logout();
  }

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface">
      <nav className="flex h-14 items-center gap-4 px-4">
        <Link
          href={isPublic ? "/" : "/feed"}
          className="shrink-0 text-lg font-bold text-primary"
        >
          ChatInit
        </Link>

        {!isPublic && (
          <>
            <input
              type="search"
              placeholder="Buscar personas..."
              className="w-full max-w-sm rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-primary"
            />

            <Link
              href="/notificaciones"
              aria-label="Notificaciones"
              className="relative ml-auto shrink-0 text-xl"
            >
              🔔
              <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-white">
                2
              </span>
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              aria-label="Cerrar sesión"
              className="shrink-0 text-xl disabled:opacity-50"
            >
              🚪
            </button>
          </>
        )}
      </nav>
    </header>
  );
}
