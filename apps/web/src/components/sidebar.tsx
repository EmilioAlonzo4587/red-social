"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ConversationDto, MeDto, UnreadCountDto } from "@red/api-types";
import { NotificationsPanel } from "@/components/notifications-panel";
import { apiFetchClient } from "@/lib/api-client";
import { PUBLIC_PATHS } from "@/lib/public-paths";
import {
  subscribeConversationRead,
  subscribeConversationUpdated,
  subscribeNotificationNew,
  subscribeNotificationsRead,
} from "@/lib/socket";
import { SETTINGS_ICON_PATH } from "@/components/settings-icon";

function linkClass(active: boolean): string {
  return active
    ? "flex items-center gap-2.5 rounded-lg bg-surface px-2.5 py-2 text-sm font-semibold text-primary"
    : "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-foreground hover:bg-surface";
}

// Barra inferior del celular (S4-06): ícono arriba y texto chico abajo.
function mobileLinkClass(active: boolean): string {
  return `flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
    active ? "text-primary" : "text-muted"
  }`;
}

function Icon({ path, className = "h-[18px] w-[18px]" }: { path: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
      className={`shrink-0 ${className}`}
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
  ajustes: SETTINGS_ICON_PATH,
};

// null si falla: notification:new sigue actualizando el contador en vivo
async function fetchUnreadNotifications(): Promise<number | null> {
  try {
    const res = await apiFetchClient<UnreadCountDto>(
      "/api/notifications/unread-count",
    );
    return typeof res?.count === "number" ? res.count : null;
  } catch {
    return null;
  }
}

export function Sidebar() {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.includes(pathname);
  const [username, setUsername] = useState<string | null>(null);
  const [unreadByConv, setUnreadByConv] = useState<Record<string, number>>({});
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDrawerOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

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
    const unsubNotificationNew = subscribeNotificationNew((notification) => {
      if (!notification.read) {
        setUnreadNotifications((count) => count + 1);
      }
    });
    const unsubNotificationsRead = subscribeNotificationsRead(
      ({ decrement, all }) => {
        setUnreadNotifications((count) =>
          all ? 0 : Math.max(0, count - (decrement ?? 1)),
        );
      },
    );

    return () => {
      unsubUpdated();
      unsubRead();
      unsubNotificationNew();
      unsubNotificationsRead();
    };
  }, [isPublic]);

  // El contador se pide al montar y en cada navegación, así se corrige si algo lo
  // marcó como leído fuera de este componente.
  useEffect(() => {
    if (isPublic) return;
    let cancelled = false;
    void fetchUnreadNotifications().then((count) => {
      if (!cancelled && count !== null) setUnreadNotifications(count);
    });
    return () => {
      cancelled = true;
    };
  }, [isPublic, pathname]);

  if (isPublic) return null;

  const unreadMessages = Object.values(unreadByConv).reduce(
    (sum, count) => sum + count,
    0,
  );

  const profileHref = username ? `/u/${username}` : null;
  const isNotificationsActive = drawerOpen || pathname === "/notificaciones";

  function handleNotificationsClick(
    event: React.MouseEvent<HTMLAnchorElement>,
  ) {
    if (
      pathname === "/notificaciones" ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }
    event.preventDefault();
    setDrawerOpen((open) => !open);
  }

  return (
    <>
    <nav
      aria-label="Navegación principal"
      className="sticky top-16 z-30 hidden h-[calc(100vh-64px)] w-[190px] shrink-0 flex-col gap-0.5 border-r border-border bg-background px-2.5 py-4 sm:flex"
    >
      <Link
        href="/feed"
        onClick={() => setDrawerOpen(false)}
        className={linkClass(!drawerOpen && pathname === "/feed")}
      >
        <Icon path={ICONS.inicio} />
        Inicio
      </Link>
      <Link
        href="/notificaciones"
        aria-expanded={drawerOpen}
        onClick={handleNotificationsClick}
        className={linkClass(isNotificationsActive)}
      >
        <Icon path={ICONS.notificaciones} />
        <span className="flex-1">Notificaciones</span>
        {unreadNotifications > 0 && (
          <span
            aria-label={`${unreadNotifications} notificaciones sin leer`}
            className="flex h-5 min-w-5 items-center justify-center rounded-full bg-action px-1.5 text-xs font-semibold text-white"
          >
            {unreadNotifications}
          </span>
        )}
      </Link>
      <Link
        href="/chat"
        onClick={() => setDrawerOpen(false)}
        className={linkClass(!drawerOpen && pathname === "/chat")}
      >
        <Icon path={ICONS.mensajes} />
        <span className="flex-1">Mensajes</span>
        {unreadMessages > 0 && (
          <span
            aria-label={`${unreadMessages} sin leer`}
            className="flex h-5 min-w-5 items-center justify-center rounded-full bg-action px-1.5 text-xs font-semibold text-white"
          >
            {unreadMessages}
          </span>
        )}
      </Link>
      {username && (
        <Link
          href={`/u/${username}`}
          onClick={() => setDrawerOpen(false)}
          className={linkClass(!drawerOpen && pathname === `/u/${username}`)}
        >
          <Icon path={ICONS.perfil} />
          Mi perfil
        </Link>
      )}
      {/* S4-13: en el celular se entra desde el engranaje de la barra superior (Navbar) */}
      <Link
        href="/ajustes"
        onClick={() => setDrawerOpen(false)}
        aria-current={!drawerOpen && pathname === "/ajustes" ? "page" : undefined}
        className={linkClass(!drawerOpen && pathname === "/ajustes")}
      >
        <Icon path={ICONS.ajustes} />
        Ajustes
      </Link>
    </nav>

    {/* Celular (S4-06): la barra lateral se oculta bajo `sm`, así que la navegación
        pasa a una barra fija abajo. El padre en layout.tsx reserva su alto con
        has-[#mobile-nav] para que no tape el final del contenido. */}
    <nav
      id="mobile-nav"
      aria-label="Navegación inferior"
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <Link
        href="/feed"
        onClick={() => setDrawerOpen(false)}
        aria-current={!drawerOpen && pathname === "/feed" ? "page" : undefined}
        className={mobileLinkClass(!drawerOpen && pathname === "/feed")}
      >
        <Icon path={ICONS.inicio} className="h-[22px] w-[22px]" />
        Inicio
      </Link>
      <Link
        href="/notificaciones"
        aria-expanded={drawerOpen}
        onClick={handleNotificationsClick}
        aria-current={pathname === "/notificaciones" ? "page" : undefined}
        className={mobileLinkClass(isNotificationsActive)}
      >
        <span className="relative">
          <Icon path={ICONS.notificaciones} className="h-[22px] w-[22px]" />
          {unreadNotifications > 0 && (
            <span
              aria-label={`${unreadNotifications} notificaciones sin leer`}
              className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-action px-1 text-[10px] font-semibold text-white"
            >
              {unreadNotifications}
            </span>
          )}
        </span>
        Notificaciones
      </Link>
      <Link
        href="/chat"
        onClick={() => setDrawerOpen(false)}
        aria-current={!drawerOpen && pathname === "/chat" ? "page" : undefined}
        className={mobileLinkClass(!drawerOpen && pathname === "/chat")}
      >
        <span className="relative">
          <Icon path={ICONS.mensajes} className="h-[22px] w-[22px]" />
          {unreadMessages > 0 && (
            <span
              aria-label={`${unreadMessages} sin leer`}
              className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-action px-1 text-[10px] font-semibold text-white"
            >
              {unreadMessages}
            </span>
          )}
        </span>
        Mensajes
      </Link>
      {profileHref && (
        <Link
          href={profileHref}
          onClick={() => setDrawerOpen(false)}
          aria-current={!drawerOpen && pathname === profileHref ? "page" : undefined}
          className={mobileLinkClass(!drawerOpen && pathname === profileHref)}
        >
          <Icon path={ICONS.perfil} className="h-[22px] w-[22px]" />
          Mi perfil
        </Link>
      )}
    </nav>

    {drawerOpen && pathname !== "/notificaciones" && (
      <>
        <div
          aria-hidden="true"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 top-16 z-20 bg-black/25 backdrop-blur-[1px] sm:left-[190px]"
        />
        <aside
          role="dialog"
          aria-label="Panel de notificaciones"
          className="notification-drawer fixed top-16 bottom-16 left-0 z-30 flex w-full flex-col overflow-hidden border-r border-border bg-background shadow-[0_12px_40px_rgba(15,26,20,0.16)] sm:bottom-0 sm:left-[190px] sm:w-[420px] sm:rounded-r-2xl"
        >
          <NotificationsPanel
            titleAs="h2"
            onClose={() => setDrawerOpen(false)}
          />
        </aside>
      </>
    )}
    </>
  );}
