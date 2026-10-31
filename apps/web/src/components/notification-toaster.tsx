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
import type {
  ConversationDto,
  MeDto,
  MessageDto,
  NotificationDto,
  UserSummaryDto,
} from "@red/api-types";
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
  subscribeConversationUpdated,
  subscribeNotificationNew,
} from "@/lib/socket";
import { reactionActionText } from "@/lib/reactions";

export const TOAST_DURATION_MS = 5000;
// Plegados, se ven el aviso más reciente y asomando detrás hasta 2 más; el resto queda
// escondido detrás (S4-16)
export const PEEKING_TOASTS = 2;
const PEEK_OFFSET_PX = 10;
const PEEK_SCALE_STEP = 0.05;

// Los mensajes ya no son notificaciones guardadas (S4-15): su aviso sale de
// conversation:updated, pero se ve igual que los demás.
export type ToastType = NotificationDto["type"] | "message";

interface Toast {
  id: string;
  type: ToastType;
  actor: UserSummaryDto;
  actionText: string;
  preview: string | null;
  href: string;
  // La notificación sin leer que se marca al abrir el aviso; null en los de mensaje
  unreadNotificationId: string | null;
}

export const NOTIFICATION_ACTION: Record<ToastType, string> = {
  like: "reaccionó a tu publicación",
  comment: "comentó tu publicación",
  follow: "empezó a seguirte",
  message: "te envió un mensaje",
  reply: "respondió a tu comentario",
};

export const NOTIFICATION_ACCENT: Record<
  ToastType,
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

const TYPE_ICON_PATH: Record<ToastType, string> = {
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
  }
}

function notificationToast(notification: NotificationDto): Toast {
  return {
    id: notification.id,
    type: notification.type,
    actor: notification.actor,
    actionText:
      reactionActionText(notification.reaction) ??
      NOTIFICATION_ACTION[notification.type],
    preview: notification.preview,
    href: notificationHref(notification),
    unreadNotificationId: notification.read ? null : notification.id,
  };
}

// Un aviso por mensaje (S4-15): varios seguidos se apilan
function messageToast(
  conversation: ConversationDto,
  message: MessageDto,
): Toast {
  const sender = conversation.otherUser;
  return {
    id: `message:${message.id}`,
    type: "message",
    actor: sender,
    actionText: NOTIFICATION_ACTION.message,
    preview: message.content,
    href: `/chat?username=${encodeURIComponent(sender.username)}`,
    unreadNotificationId: null,
  };
}

export function NotificationToaster() {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.includes(pathname);
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Con el mouse encima o el foco dentro, el mazo se despliega en lista
  const [expanded, setExpanded] = useState(false);
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

    function showToast(toast: Toast) {
      playNotificationSound();
      setToasts((prev) => {
        // Un mazo nuevo empieza plegado aunque el anterior se haya ido desplegado
        if (prev.length === 0) setExpanded(false);
        const withoutDuplicate = prev.filter((item) => {
          if (item.id !== toast.id) return true;
          clearToastTimer(item.id);
          return false;
        });
        // Sin tope desde S4-15: cada uno se va solo a los 5 s
        return [toast, ...withoutDuplicate];
      });
      startToastTimer(toast.id);
    }

    const timers = timersRef.current;
    const unsubNotification = subscribeNotificationNew((notification) => {
      if (
        currentUserIdRef.current &&
        notification.actor.id === currentUserIdRef.current
      ) {
        return;
      }
      showToast(notificationToast(notification));
    });

    // conversation:updated llega a los dos participantes con cada mensaje: solo avisa a
    // quien lo recibe, y no si esa conversación ya está abierta en /chat (S4-11).
    const unsubConversation = subscribeConversationUpdated((conversation) => {
      const message = conversation.lastMessage;
      if (!message || message.senderId !== conversation.otherUser.id) return;
      if (getActiveChatUser() === conversation.otherUser.id) return;
      showToast(messageToast(conversation, message));
    });

    return () => {
      unsubNotification();
      unsubConversation();
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, [isPublic, clearToastTimer, startToastTimer]);

  if (isPublic || toasts.length === 0) return null;

  function handleOpen(toast: Toast) {
    dismissToast(toast.id);
    if (toast.unreadNotificationId) {
      notifyNotificationsRead({ decrement: 1 });
      void apiFetchClient<void>("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [toast.unreadNotificationId] }),
      }).catch(() => {});
    }
  }

  // Uno encima del otro, como un mazo (S4-16): el más reciente arriba y completo, y los
  // anteriores asomando detrás, así ocupa el lugar de un solo aviso aunque lleguen 10.
  // Todos comparten la misma celda de la grilla; al desplegarse pasan a una lista.
  const isExpanded = expanded && toasts.length > 1;
  return (
    <div
      aria-live="polite"
      // Con el mouse encima se pausan todos, no solo el de abajo del cursor: desplegados,
      // los demás no se cierran mientras se leen
      onMouseEnter={() => {
        setExpanded(true);
        for (const toast of toasts) clearToastTimer(toast.id);
      }}
      onMouseLeave={() => {
        setExpanded(false);
        for (const toast of toasts) startToastTimer(toast.id);
      }}
      onFocus={() => setExpanded(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setExpanded(false);
      }}
      className={`fixed top-20 left-1/2 z-40 w-full max-w-md -translate-x-1/2 px-4 ${
        isExpanded
          ? "flex max-h-[calc(100dvh-6rem)] flex-col gap-2 overflow-y-auto pb-2"
          : "pointer-events-none grid"
      }`}
    >
      {toasts.map((toast, index) => {
        const actorName = toast.actor.displayName ?? toast.actor.username;
        const accent = NOTIFICATION_ACCENT[toast.type];
        // Plegado, solo el de arriba se usa; los de atrás no reciben clics ni foco
        const behind = !isExpanded && index > 0;
        const hidden = !isExpanded && index > PEEKING_TOASTS;
        const depth = Math.min(index, PEEKING_TOASTS);
        return (
          <div
            key={toast.id}
            role="status"
            aria-hidden={hidden || undefined}
            inert={behind || undefined}
            style={
              isExpanded
                ? undefined
                : {
                    zIndex: toasts.length - index,
                    opacity: hidden ? 0 : 1,
                    transform: `translateY(${depth * PEEK_OFFSET_PX}px) scale(${1 - depth * PEEK_SCALE_STEP})`,
                  }
            }
            className={`notification-toast flex shrink-0 origin-bottom items-start gap-3 rounded-xl border border-border border-l-4 ${accent.border} bg-background p-3 shadow-md transition-[transform,opacity] duration-200 motion-reduce:transition-none ${
              isExpanded ? "" : "[grid-area:1/1] self-start"
            } ${behind ? "pointer-events-none" : "pointer-events-auto"}`}
          >
            <Link
              href={toast.href}
              onClick={() => handleOpen(toast)}
              className="flex min-w-0 flex-1 items-start gap-3"
            >
              <div className="relative shrink-0">
                <Avatar
                  name={actorName}
                  avatarPublicId={toast.actor.avatarPublicId}
                  size="sm"
                />
                <span
                  aria-hidden="true"
                  className={`absolute -right-1 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-background ${accent.badge}`}
                >
                  <Icon
                    path={TYPE_ICON_PATH[toast.type]}
                    className="h-2.5 w-2.5"
                  />
                </span>
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <p className="text-foreground">
                  <span className="font-semibold">{actorName}</span>{" "}
                  {toast.actionText}
                </p>
                {toast.preview && (
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {toast.preview}
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
                onClick={() => dismissToast(toast.id)}
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
