"use client";

import { useState } from "react";
import { Avatar } from "@/components/avatar";

type ConversationPreview = {
  id: string;
  name: string;
  username: string;
  lastMessage: string;
  timeLabel: string;
  unread: number;
};

type Message = {
  id: string;
  content: string;
  fromMe: boolean;
  timeLabel: string;
};

const CONVERSATIONS: ConversationPreview[] = [
  {
    id: "1",
    name: "Carlos Pérez",
    username: "carlosp",
    lastMessage: "Nos vemos mañana entonces",
    timeLabel: "10:42",
    unread: 2,
  },
  {
    id: "2",
    name: "Luisa Méndez",
    username: "luisamendez",
    lastMessage: "Jajaja sí, está buenísimo",
    timeLabel: "ayer",
    unread: 0,
  },
  {
    id: "3",
    name: "Ana García",
    username: "ana_garcia",
    lastMessage: "Gracias por la ayuda con el proyecto",
    timeLabel: "lunes",
    unread: 0,
  },
];

const INITIAL_MESSAGES: Record<string, Message[]> = {
  "1": [
    { id: "m1", content: "Hola, ¿sigue en pie lo de mañana?", fromMe: false, timeLabel: "10:30" },
    { id: "m2", content: "Sí, claro. ¿A qué hora?", fromMe: true, timeLabel: "10:35" },
    { id: "m3", content: "Nos vemos mañana entonces", fromMe: false, timeLabel: "10:42" },
  ],
  "2": [
    { id: "m4", content: "Viste el post que publiqué?", fromMe: false, timeLabel: "ayer" },
    { id: "m5", content: "Jajaja sí, está buenísimo", fromMe: false, timeLabel: "ayer" },
  ],
  "3": [
    { id: "m6", content: "Gracias por la ayuda con el proyecto", fromMe: false, timeLabel: "lunes" },
  ],
};

const MESSAGE_MAX = 2000;

export default function ChatPage() {
  const [conversations, setConversations] = useState(CONVERSATIONS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messagesByConversation, setMessagesByConversation] = useState(INITIAL_MESSAGES);
  const [draft, setDraft] = useState("");

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const messages = selectedId ? (messagesByConversation[selectedId] ?? []) : [];

  function openConversation(id: string) {
    setSelectedId(id);
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)),
    );
  }

  function handleSend(event: React.FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !selectedId) return;

    setMessagesByConversation((prev) => ({
      ...prev,
      [selectedId]: [
        ...(prev[selectedId] ?? []),
        { id: `local-${Date.now()}`, content, fromMe: true, timeLabel: "ahora" },
      ],
    }));
    setDraft("");
  }

  return (
    <main className="flex h-[calc(100vh-64px)]">
      <aside
        className={`w-full shrink-0 overflow-y-auto border-r border-border md:flex md:w-80 ${
          selectedId ? "hidden" : "flex flex-col"
        }`}
      >
        {conversations.length === 0 ? (
          <p className="p-6 text-center text-muted">
            Todavía no tienes conversaciones.
          </p>
        ) : (
          conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => openConversation(conversation.id)}
              className="flex items-center gap-3 border-b border-border px-4 py-3 text-left hover:bg-surface"
            >
              <Avatar name={conversation.name} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">
                    {conversation.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {conversation.timeLabel}
                  </span>
                </div>
                <p className="truncate text-sm text-muted">
                  {conversation.lastMessage}
                </p>
              </div>
              {conversation.unread > 0 && (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                  {conversation.unread}
                </span>
              )}
            </button>
          ))
        )}
      </aside>

      <section
        className={`flex-1 flex-col ${selected ? "flex" : "hidden md:flex"}`}
      >
        {!selected ? (
          <div className="flex h-full items-center justify-center text-muted">
            Selecciona una conversación para empezar a chatear.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Volver a la bandeja"
                className="text-muted md:hidden"
              >
                ←
              </button>
              <Avatar name={selected.name} size="sm" />
              <span className="font-semibold">{selected.name}</span>
            </div>

            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex flex-col ${message.fromMe ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                      message.fromMe
                        ? "bg-primary text-white"
                        : "bg-surface text-foreground"
                    }`}
                  >
                    {message.content}
                  </div>
                  <span className="mt-0.5 text-xs text-muted">
                    {message.timeLabel}
                  </span>
                </div>
              ))}
            </div>

            <form
              onSubmit={handleSend}
              className="flex items-center gap-2 border-t border-border p-3"
            >
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={MESSAGE_MAX}
                placeholder="Escribe un mensaje..."
                className="flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-primary"
              />
              <button
                type="submit"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
              >
                Enviar
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
