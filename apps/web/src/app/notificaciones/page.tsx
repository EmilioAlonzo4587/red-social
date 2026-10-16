"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";

type NotificationType = "like" | "comment" | "follow" | "message";

type Notification = {
  id: string;
  type: NotificationType;
  actorName: string;
  timeLabel: string;
  read: boolean;
  href: string;
};

const MESSAGES: Record<NotificationType, string> = {
  like: "le dio like a tu publicación",
  comment: "comentó tu publicación",
  follow: "empezó a seguirte",
  message: "te envió un mensaje",
};

const INITIAL_NOTIFICATIONS: Notification[] = [
  {
    id: "n1",
    type: "like",
    actorName: "Carlos Pérez",
    timeLabel: "hace 10 min",
    read: false,
    href: "/p/1",
  },
  {
    id: "n2",
    type: "comment",
    actorName: "Luisa Méndez",
    timeLabel: "hace 1 h",
    read: false,
    href: "/p/1",
  },
  {
    id: "n3",
    type: "follow",
    actorName: "Carlos Pérez",
    timeLabel: "ayer",
    read: true,
    href: "/u/carlosp",
  },
  {
    id: "n4",
    type: "message",
    actorName: "Ana García",
    timeLabel: "lunes",
    read: true,
    href: "/chat",
  },
];

export default function NotificacionesPage() {
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);
  const unreadCount = notifications.filter((n) => !n.read).length;

  function markAllAsRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function markAsRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4">
      <div className="flex items-center justify-between py-4">
        <h1 className="text-xl font-bold">Notificaciones</h1>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllAsRead}
            className="text-sm font-medium text-primary hover:underline"
          >
            Marcar todas como leídas
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <p className="py-16 text-center text-muted">
          No tienes notificaciones todavía.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {notifications.map((notification) => (
            <Link
              key={notification.id}
              href={notification.href}
              onClick={() => markAsRead(notification.id)}
              className={`flex items-center gap-3 px-2 py-3 hover:bg-surface ${
                notification.read ? "" : "bg-surface/60"
              }`}
            >
              <Avatar name={notification.actorName} size="sm" />
              <p className="flex-1 text-sm">
                <span className="font-semibold">{notification.actorName}</span>{" "}
                {MESSAGES[notification.type]}
                <span className="block text-xs text-muted">
                  {notification.timeLabel}
                </span>
              </p>
              {!notification.read && (
                <span
                  className="h-2 w-2 shrink-0 rounded-full bg-primary"
                  aria-hidden
                />
              )}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
