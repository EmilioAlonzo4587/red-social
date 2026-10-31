"use client";

import { NotificationsPanel } from "@/components/notifications-panel";

export default function NotificacionesPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-xs">
        <NotificationsPanel />
      </div>
    </main>
  );
}
