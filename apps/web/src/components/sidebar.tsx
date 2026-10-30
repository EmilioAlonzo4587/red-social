"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ConversationDto, MeDto } from "@red/api-types";
import { apiFetchClient } from "@/lib/api-client";
import { PUBLIC_PATHS } from "@/lib/public-paths";
import {
  subscribeConversationRead,
  subscribeConversationUpdated,
} from "@/lib/socket";

function linkClass(active: boolean): string {
  return active
    ? "flex items-center gap-2.5 rounded-lg bg-surface px-2.5 py-2 text-sm font-semibold text-primary"
    : "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-foreground hover:bg-surface";
}

function Icon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
      className="h-[18px] w-[18px] shrink-0"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

// Los mismos trazos del mockup de S4-09.
const ICONS = {
  inicio: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  notificaciones: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4",
  mensajes: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z",
  perfil: "M8 8a4 4 0 1 0 8 0a4 4 0 1 0-8 0M4 21a8 8 0 0 1 16 0",
};

export function Sidebar() {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.includes(pathname);
  const [username, setUsername] = useState<string | null>(null);
  const [unreadByConv, setUnreadByConv] = useState<Record<string, number>>({});

  useEffect(() => {
    if (isPublic) return;

    void (async () => {
      try {
        const me = await apiFetchClient<MeDto>("/api/auth/me");
        if (me?.username) setUsername(me.username);
      } catch {
        // Silencioso: el resto del menú sigue funcionando.
      }
    })();

    void (async () => {
      try {
        const conversations =
          await apiFetchClient<ConversationDto[]>("/api/conversations");
        if (Array.isArray(conversations)) {
          setUnreadByConv(
            Object.fromEntries(conversations.map((c) => [c.id, c.unread])),
          );
        }
      } catch {
        // Silencioso: si falla la carga inicial, conversation:updated lo irá actualizando.
      }
    })();

    const unsubUpdated = subscribeConversationUpdated((conv) => {
      setUnreadByConv((prev) => ({ ...prev, [conv.id]: conv.unread }));
    });
    const unsubRead = subscribeConversationRead((conversationId) => {
      setUnreadByConv((prev) =>
        prev[conversationId] ? { ...prev, [conversationId]: 0 } : prev,
      );
    });

    return () => {
      unsubUpdated();
      unsubRead();
    };
  }, [isPublic]);

  if (isPublic) return null;

  const unreadMessages = Object.values(unreadByConv).reduce(
    (sum, count) => sum + count,
    0,
  );

  return (
    <nav
      aria-label="Navegación principal"
      className="sticky top-16 hidden h-[calc(100vh-64px)] w-[190px] shrink-0 flex-col gap-0.5 border-r border-border px-2.5 py-4 sm:flex"
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
      <Link href="/chat" className={linkClass(pathname === "/chat")}>
        <Icon path={ICONS.mensajes} />
        <span className="flex-1">Mensajes</span>
        {unreadMessages > 0 && (
          <span
            aria-label={`${unreadMessages} sin leer`}
            className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-white"
          >
            {unreadMessages}
          </span>
        )}
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
