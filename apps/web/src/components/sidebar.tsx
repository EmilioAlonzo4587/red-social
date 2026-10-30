"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { MeDto } from "@red/api-types";
import { apiFetchClient } from "@/lib/api-client";
import { PUBLIC_PATHS } from "@/lib/public-paths";

function linkClass(active: boolean): string {
  return active
    ? "rounded-md bg-surface px-3 py-2 text-sm font-semibold text-primary"
    : "rounded-md px-3 py-2 text-sm font-medium hover:bg-surface";
}

export function Sidebar() {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.includes(pathname);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    if (isPublic) return;
    apiFetchClient<MeDto>("/api/auth/me")
      .then((me) => setUsername(me.username))
      .catch(() => {});
  }, [isPublic]);

  if (isPublic) return null;

  return (
    <nav
      aria-label="Navegación principal"
      className="sticky top-14 hidden h-[calc(100vh-56px)] w-56 shrink-0 flex-col gap-1 border-r border-border p-4 sm:flex"
    >
      <Link href="/feed" className={linkClass(pathname === "/feed")}>
        Inicio
      </Link>
      {/* Mientras S3-07 no exista, enlaza a la página actual en vez de abrir un panel. */}
      <Link
        href="/notificaciones"
        className={linkClass(pathname === "/notificaciones")}
      >
        Notificaciones
      </Link>
      {/* Mientras S3-06 no exista, enlaza a la página actual en vez de abrir un panel. */}
      <Link href="/chat" className={linkClass(pathname === "/chat")}>
        Mensajes
      </Link>
      {username && (
        <Link
          href={`/u/${username}`}
          className={linkClass(pathname === `/u/${username}`)}
        >
          Mi perfil
        </Link>
      )}
    </nav>
  );
}
