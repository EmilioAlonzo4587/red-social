"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { MeDto } from "@red/api-types";
import { apiFetchClient } from "@/lib/api-client";
import { PUBLIC_PATHS } from "@/lib/public-paths";

function linkClass(active: boolean): string {
  return active
    ? "flex items-center gap-3 rounded-md bg-surface px-3 py-2 text-sm font-semibold text-primary"
    : "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-surface";
}

function Icon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

const ICONS = {
  inicio:
    "M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25",
  notificaciones:
    "M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0",
  mensajes:
    "M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155",
  perfil:
    "M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z",
};

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
        <Icon path={ICONS.inicio} />
        Inicio
      </Link>
      {/* Mientras S3-07 no exista, enlaza a la página actual en vez de abrir un panel. */}
      <Link
        href="/notificaciones"
        className={linkClass(pathname === "/notificaciones")}
      >
        <Icon path={ICONS.notificaciones} />
        Notificaciones
      </Link>
      {/* Mientras S3-06 no exista, enlaza a la página actual en vez de abrir un panel. */}
      <Link href="/chat" className={linkClass(pathname === "/chat")}>
        <Icon path={ICONS.mensajes} />
        Mensajes
      </Link>
      {username && (
        <Link
          href={`/u/${username}`}
          className={linkClass(pathname === `/u/${username}`)}
        >
          <Icon path={ICONS.perfil} />
          Mi perfil
        </Link>
      )}
    </nav>
  );
}
