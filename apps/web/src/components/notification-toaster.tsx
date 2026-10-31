"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { MeDto, NotificationDto } from "@red/api-types";
import { Avatar } from "@/components/avatar";
import { apiFetchClient } from "@/lib/api-client";
import {
  isNotificationSoundMuted,
  playNotificationSound,
  setNotificationSoundMuted,
  subscribeSoundMuted,
} from "@/lib/notification-sound";
import { PUBLIC_PATHS } from "@/lib/public-paths";
import {
  getActiveChatUser,
  notifyNotificationsRead,
  subscribeNotificationNew,
} from "@/lib/socket";
import { reactionActionText } from "@/lib/reactions";

export const TOAST_DURATION_MS = 5000;
export const MAX_TOASTS = 3;

export const NOTIFICATION_ACTION: Record<NotificationDto["type"], string> = {
  like: "reaccionó a tu publicación",
  comment: "comentó tu publicación",
  follow: "empezó a seguirte",
  message: "te envió un mensaje",
  reply: "respondió a tu comentario",
};

export const NOTIFICATION_ACCENT: Record<
  NotificationDto["type"],
  { border: string; badge: string }
> = {
  like: { border: "border-l-rose-500", badge: "bg-rose-500 text-white" },
  comment: { border: "border-l-sky-500", badge: "bg-sky-500 text-white" },
  follow: { border: "border-l-violet-500", badge: "bg-violet-500 text-white" },
  message: { border: "border-l-primary", badge: "bg-action text-white" },
  reply: { border: "border-l-sky-500", badge: "bg-sky-500 text-white" },
};

const ICONS = {
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4",
  bellOff: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4M3 3l18 18",
  close: "M18 6L6 18M6 6l12 12",
  like: "M12 20.5s-7-4.35-7-10a4.2 4.2 0 0 1 7-3.1 4.2 4.2 0 0 1 7 3.1c0 5.65-7 10-7 10z",
  comment: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z",
  follow: "M8 8a4 4 0 1 0 8 0a4 4 0 1 0-8 0M4 21a8 8 0 0 1 16 0",
  reply: "M9 14L4 9l5-5M4 9h10a6 6 0 0 1 6 6v4",
  message:
    "M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm0 2l8 5 8-5",
};

const TYPE_ICON_PATH: Record<NotificationDto["type"], string> = {
  like: ICONS.like,
  comment: ICONS.comment,
  follow: ICONS.follow,
  message: ICONS.message,
  reply: ICONS.reply,
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

export function notificationHref(notification: NotificationDto): string {
  switch (notification.type) {
    case "like":
    case "comment":
    case "reply":
      return `/p/${notification.postId ?? ""}`;
    case "follow":
      return `/u/${encodeURIComponent(notification.actor.username)}`;
    case "message":
      return `/chat?username=${encodeURIComponent(notification.actor.username)}`;
  }
}

export function NotificationToaster() {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.includes(pathname);
  const [toasts, setToasts] = useState<NotificationDto[]>([]);
  const muted = useSyncExternalStore(
    subscribeSoundMuted,
    isNotificationSoundMuted,
    () => false,
  );

  const currentUserIdRef = useRef<string | null>(null);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const clearToastTimer = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const dismissToast = useCallback(
    (id: string) => {
      clearToastTimer(id);
      setToasts((prev) => prev.filter((item) => item.id !== id));
    },
    [clearToastTimer],
  );

  const startToastTimer = useCallback(
    (id: string) => {
      clearToastTimer(id);
      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, TOAST_DURATION_MS);
      timersRef.current.set(id, timer);
    },
    [clearToastTimer],
  );

  useEffect(() => {
    if (isPublic) return;

    void (async () => {
      try {
        const me = await apiFetchClient<MeDto>("/api/auth/me");
        if (me?.id) currentUserIdRef.current = me.id;
      } catch {
        // Silencioso: RN08 ya descarta las notificaciones propias en el servidor.
      }
    })();

    const timers = timersRef.current;
    const unsub = subscribeNotificationNew((notification) => {
      if (
        currentUserIdRef.current &&
        notification.actor.id === currentUserIdRef.current
      ) {
        return;
      }

      // El aviso de mensaje no aparece si esa conversación ya está abierta (S4-11)
      if (
        notification.type === "message" &&
        getActiveChatUser() === notification.actor.id
      ) {
        notifyNotificationsRead({ decrement: 1 });
        void apiFetchClient<void>("/api/notifications/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [notification.id] }),
        }).catch(() => {});
        return;
      }

      playNotificationSound(notification.type);

      setToasts((prev) => {
        // En mensajes se muestra como máximo una ventana emergente por remitente
        const withoutDuplicate = prev.filter((item) => {
          const sameId = item.id === notification.id;
          const sameMessageSender =
            notification.type === "message" &&
            item.type === "message" &&
            item.actor.id === notification.actor.id;
          if (sameId || sameMessageSender) {
            clearToastTimer(item.id);
            return false;
          }
          return true;
        });
        const next = [notification, ...withoutDuplicate];
        if (next.length > MAX_TOASTS) {
          for (const evicted of next.slice(MAX_TOASTS)) {
            clearToastTimer(evicted.id);
          }
        }
        return next.slice(0, MAX_TOASTS);
      });
      startToastTimer(notification.id);
    });

    return () => {
      unsub();
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, [isPublic, clearToastTimer, startToastTimer]);

  if (isPublic || toasts.length === 0) return null;

  function handleOpen(notification: NotificationDto) {
    dismissToast(notification.id);
    if (!notification.read) {
      notifyNotificationsRead({ decrement: 1 });
      void apiFetchClient<void>("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [notification.id] }),
      }).catch(() => {});
    }
  }

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed top-20 left-1/2 z-40 flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4"
    >
      {toasts.map((notification) => {
        const actorName =
          notification.actor.displayName ?? notification.actor.username;
        const accent = NOTIFICATION_ACCENT[notification.type];
        return (
          <div
            key={notification.id}
            role="status"
            onMouseEnter={() => clearToastTimer(notification.id)}
            onMouseLeave={() => startToastTimer(notification.id)}
            className={`notification-toast pointer-events-auto flex items-start gap-3 rounded-xl border border-border border-l-4 ${accent.border} bg-background p-3 shadow-md`}
          >
            <Link
              href={notificationHref(notification)}
              onClick={() => handleOpen(notification)}
              className="flex min-w-0 flex-1 items-start gap-3"
            >
              <div className="relative shrink-0">
                <Avatar
                  name={actorName}
                  avatarPublicId={notification.actor.avatarPublicId}
                  size="sm"
                />
                <span
                  aria-hidden="true"
                  className={`absolute -right-1 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-background ${accent.badge}`}
                >
                  <Icon
                    path={TYPE_ICON_PATH[notification.type]}
                    className="h-2.5 w-2.5"
                  />
                </span>
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <p className="text-foreground">
                  <span className="font-semibold">{actorName}</span>{" "}
                  {reactionActionText(notification.reaction) ??
                    NOTIFICATION_ACTION[notification.type]}
                </p>
                {notification.preview && (
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {notification.preview}
                  </p>
                )}
              </div>
            </Link>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-pressed={muted}
                aria-label={
                  muted
                    ? "Activar sonido de notificaciones"
                    : "Silenciar notificaciones"
                }
                onClick={() => setNotificationSoundMuted(!muted)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-foreground"
              >
                <Icon
                  path={muted ? ICONS.bellOff : ICONS.bell}
                  className="h-3.5 w-3.5"
                />
              </button>
              <button
                type="button"
                aria-label="Cerrar notificación"
                onClick={() => dismissToast(notification.id)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-foreground"
              >
                <Icon path={ICONS.close} className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
