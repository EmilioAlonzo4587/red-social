"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { NotificationDto, NotificationPageDto } from "@red/api-types";
import { Avatar } from "@/components/avatar";
import { apiFetchClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";
import { formatRelativeTime } from "@/lib/format";
import {
  isNotificationSoundMuted,
  setNotificationSoundMuted,
  subscribeSoundMuted,
} from "@/lib/notification-sound";
import {
  notifyNotificationsRead,
  subscribeNotificationNew,
} from "@/lib/socket";
import { reactionActionText } from "@/lib/reactions";

type NotificationType = NotificationDto["type"];
type FilterTab = "all" | "unread";

const MESSAGES: Record<NotificationType, string> = {
  like: "reaccionó a tu publicación",
  comment: "comentó tu publicación",
  follow: "empezó a seguirte",
  message: "te envió un mensaje",
};

const TYPE_ACCENT_BADGE: Record<NotificationType, string> = {
  like: "bg-rose-500 text-white",
  comment: "bg-sky-500 text-white",
  follow: "bg-violet-500 text-white",
  message: "bg-primary text-white",
};

// Mismos trazos SVG de línea que usa Sidebar (strokeWidth 2).
const ICONS = {
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4",
  bellOff: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4M3 3l18 18",
  close: "M18 6L6 18M6 6l12 12",
  like: "M12 20.5s-7-4.35-7-10a4.2 4.2 0 0 1 7-3.1 4.2 4.2 0 0 1 7 3.1c0 5.65-7 10-7 10z",
  comment: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z",
  follow: "M8 8a4 4 0 1 0 8 0a4 4 0 1 0-8 0M4 21a8 8 0 0 1 16 0",
  message:
    "M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm0 2l8 5 8-5",
};

const TYPE_ICON_PATH: Record<NotificationType, string> = {
  like: ICONS.like,
  comment: ICONS.comment,
  follow: ICONS.follow,
  message: ICONS.message,
};

function Icon({
  path,
  className = "h-4 w-4",
}: {
  path: string;
  className?: string;
}) {
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

export function notificationItemHref(notification: NotificationDto): string {
  if (notification.type === "follow") {
    return `/u/${notification.actor.username}`;
  }
  if (notification.type === "message") {
    return `/chat?username=${encodeURIComponent(notification.actor.username)}`;
  }
  return notification.postId
    ? `/p/${notification.postId}`
    : `/u/${notification.actor.username}`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export function NotificationsPanel({
  onClose,
  titleAs = "h1",
}: {
  onClose?: () => void;
  titleAs?: "h1" | "h2";
}) {
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("all");

  const soundMuted = useSyncExternalStore(
    subscribeSoundMuted,
    isNotificationSoundMuted,
    () => false,
  );

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      setStatus("loading");
      setError(null);
      try {
        const page =
          await apiFetchClient<NotificationPageDto>("/api/notifications");
        if (cancelled) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(
          errorMessage(err, "No se pudieron cargar las notificaciones."),
        );
      }
    }

    void loadInitial();

    const unsubSocket = subscribeNotificationNew((incoming) => {
      setItems((prev) =>
        prev.some((n) => n.id === incoming.id) ? prev : [incoming, ...prev],
      );
    });

    return () => {
      cancelled = true;
      unsubSocket();
    };
  }, []);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await apiFetchClient<NotificationPageDto>(
        `/api/notifications?cursor=${encodeURIComponent(nextCursor)}`,
      );
      setItems((prev) => {
        const existingIds = new Set(prev.map((n) => n.id));
        const fresh = page.items.filter((n) => !existingIds.has(n.id));
        return [...prev, ...fresh];
      });
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(
        errorMessage(err, "No se pudieron cargar más notificaciones."),
      );
    } finally {
      setLoadingMore(false);
    }
  }

  function markAsRead(notification: NotificationDto) {
    if (!notification.read) {
      setItems((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)),
      );
      notifyNotificationsRead({ decrement: 1 });
      void apiFetchClient<void>("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [notification.id] }),
      }).catch(() => {});
    }
    onClose?.();
  }

  function markAllAsRead() {
    const unread = items.filter((n) => !n.read).length;
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    notifyNotificationsRead({ all: true, decrement: unread });
    void apiFetchClient<void>("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
  }

  const unreadCount = items.filter((n) => !n.read).length;
  const visibleItems =
    filter === "unread" ? items.filter((n) => !n.read) : items;
  const TitleTag = titleAs;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border px-5 pt-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <TitleTag className="text-lg font-bold tracking-tight">
              Notificaciones
            </TitleTag>
            {unreadCount > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                {unreadCount} {unreadCount === 1 ? "nueva" : "nuevas"}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setNotificationSoundMuted(!soundMuted)}
              aria-label={
                soundMuted
                  ? "Activar sonido de notificaciones"
                  : "Silenciar sonido de notificaciones"
              }
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
            >
              <Icon
                path={soundMuted ? ICONS.bellOff : ICONS.bell}
                className="h-3.5 w-3.5"
              />
              <span>{soundMuted ? "Sonido silenciado" : "Silenciar sonido"}</span>
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar panel de notificaciones"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground"
              >
                <Icon path={ICONS.close} className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-surface p-1">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                filter === "all"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => setFilter("unread")}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                filter === "unread"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted hover:text-foreground"
              }`}
            >
              No leídas{unreadCount > 0 ? ` (${unreadCount})` : ""}
            </button>
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Marcar todas como leídas
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {status === "loading" && (
          <p className="py-16 text-center text-sm text-muted">Cargando…</p>
        )}

        {status === "error" && items.length === 0 && (
          <p className="py-16 text-center text-sm text-red-600">{error}</p>
        )}

        {status === "ready" && visibleItems.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-muted"
            >
              <Icon path={ICONS.bell} className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-foreground">
              {filter === "unread"
                ? "Estás al día"
                : "No tienes notificaciones todavía."}
            </p>
            {filter === "unread" && (
              <p className="text-xs text-muted">
                No tienes notificaciones sin leer en este momento.
              </p>
            )}
          </div>
        )}

        {visibleItems.length > 0 && (
          <>
            <div className="flex flex-col divide-y divide-border">
              {visibleItems.map((notification) => {
                const actorName =
                  notification.actor.displayName ?? notification.actor.username;
                return (
                  <Link
                    key={notification.id}
                    href={notificationItemHref(notification)}
                    onClick={() => markAsRead(notification)}
                    className={`flex items-start gap-3.5 px-5 py-3.5 transition-colors hover:bg-surface ${
                      notification.read ? "" : "bg-primary/[0.04]"
                    }`}
                  >
                    <div className="relative shrink-0 pt-0.5">
                      <Avatar
                        name={actorName}
                        avatarPublicId={notification.actor.avatarPublicId}
                        size="md"
                      />
                      <span
                        aria-hidden="true"
                        className={`absolute -right-1 -bottom-0.5 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-background ${TYPE_ACCENT_BADGE[notification.type]}`}
                      >
                        <Icon
                          path={TYPE_ICON_PATH[notification.type]}
                          className="h-3 w-3"
                        />
                      </span>
                    </div>

                    <div className="min-w-0 flex-1 text-sm">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="leading-snug text-foreground">
                          <span className="font-semibold">{actorName}</span>{" "}
                          {reactionActionText(notification.reaction) ??
                            MESSAGES[notification.type]}
                        </p>
                        <span className="shrink-0 text-xs text-muted">
                          {formatRelativeTime(notification.createdAt)}
                        </span>
                      </div>

                      {notification.preview && (
                        <p className="mt-1.5 truncate rounded-lg border border-border/70 bg-surface px-2.5 py-1.5 text-xs text-muted">
                          “{notification.preview}”
                        </p>
                      )}
                    </div>

                    {!notification.read && (
                      <span
                        className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-primary"
                        aria-label="Sin leer"
                      />
                    )}
                  </Link>
                );
              })}
            </div>

            {nextCursor && (
              <div className="flex justify-center py-5">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-semibold hover:bg-surface disabled:opacity-50"
                >
                  {loadingMore ? "Cargando…" : "Cargar más"}
                </button>
              </div>
            )}

            {error && (
              <p className="pb-5 text-center text-sm text-red-600">{error}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
