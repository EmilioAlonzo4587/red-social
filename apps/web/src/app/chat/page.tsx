"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import type {
  ConversationDto,
  MeDto,
  MessageDto,
  MessagePageDto,
} from "@red/api-types";
import { Avatar } from "@/components/avatar";
import { apiFetchClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";
import { formatRelativeTime } from "@/lib/format";
import {
  emitConversationTyping,
  notifyConversationRead,
  subscribeConversationMessages,
  subscribeConversationUpdated,
  watchUsersPresence,
} from "@/lib/socket";

const MESSAGE_MAX = 2000;
const TYPING_INDICATOR_MS = 3000;

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.statusCode === 403) return "No tienes permiso.";
    return error.message;
  }
  return fallback;
}

function appendUniqueMessage(
  list: MessageDto[],
  incoming: MessageDto,
): MessageDto[] {
  return list.some((m) => m.id === incoming.id) ? list : [...list, incoming];
}

function prependUniqueMessages(
  olderChronological: MessageDto[],
  current: MessageDto[],
): MessageDto[] {
  const existingIds = new Set(current.map((m) => m.id));
  const fresh = olderChronological.filter((m) => !existingIds.has(m.id));
  return [...fresh, ...current];
}

function upsertConversationAtTop(
  list: ConversationDto[],
  updated: ConversationDto,
): ConversationDto[] {
  const rest = list.filter((c) => c.id !== updated.id);
  return [updated, ...rest];
}

function ChatView() {
  const searchParams = useSearchParams();
  const targetUsername = searchParams.get("username");

  const [currentUser, setCurrentUser] = useState<MeDto | null>(null);
  const currentUserId = currentUser?.id ?? null;
  const [conversations, setConversations] = useState<ConversationDto[]>([]);
  const [inboxStatus, setInboxStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [inboxError, setInboxError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [messagesStatus, setMessagesStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const [otherLastReadAt, setOtherLastReadAt] = useState<string | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const selectedIdRef = useRef<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    selectedIdRef.current = selectedId;
    currentUserIdRef.current = currentUserId;
  }, [selectedId, currentUserId]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  // Carga inicial: usuario actual, bandeja y, si viene ?username=, abre esa conversación.
  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      setInboxStatus("loading");
      setInboxError(null);
      try {
        const [me, inbox, opened] = await Promise.all([
          apiFetchClient<MeDto>("/api/auth/me"),
          apiFetchClient<ConversationDto[]>("/api/conversations"),
          targetUsername
            ? apiFetchClient<ConversationDto>("/api/conversations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: targetUsername }),
              })
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setCurrentUser(me);
        currentUserIdRef.current = me.id;

        const merged = opened ? upsertConversationAtTop(inbox, opened) : inbox;
        setConversations(merged);
        setInboxStatus("ready");

        if (opened) {
          openConversation(opened.id, merged);
        }
      } catch (err) {
        if (cancelled) return;
        setInboxStatus("error");
        setInboxError(
          errorMessage(err, "No se pudieron cargar las conversaciones."),
        );
      }
    }

    void loadInitial();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUsername]);

  // Escucha conversation:updated en user:{id} para actualizar y reordenar la bandeja en vivo.
  useEffect(() => {
    return subscribeConversationUpdated((updated) => {
      const isCurrentlyOpen = selectedIdRef.current === updated.id;
      const adjusted: ConversationDto = isCurrentlyOpen
        ? { ...updated, unread: 0 }
        : updated;
      setConversations((prev) => upsertConversationAtTop(prev, adjusted));

      if (isCurrentlyOpen && updated.unread > 0) {
        notifyConversationRead(updated.id);
        void apiFetchClient<void>(`/api/conversations/${updated.id}/read`, {
          method: "POST",
        }).catch(() => {});
      }
    });
  }, []);

  const contactUserIdsKey = conversations.map((c) => c.otherUser.id).join(",");
  useEffect(() => {
    const ids = contactUserIdsKey ? contactUserIdsKey.split(",") : [];
    if (ids.length === 0) return;
    return watchUsersPresence(ids, setOnlineUserIds);
  }, [contactUserIdsKey]);

  // Carga el historial inicial y se une a la sala conv:{id} cuando cambia la conversación abierta.
  useEffect(() => {
    if (!selectedId) return;
    const convId = selectedId;
    let cancelled = false;

    apiFetchClient<MessagePageDto>(`/api/conversations/${convId}/messages`)
      .then((page) => {
        if (cancelled) return;
        // La api entrega del más reciente al más antiguo; se invierten para mostrarlos (docs/05-api.md).
        setMessages([...page.items].reverse());
        setNextCursor(page.nextCursor);
        setMessagesStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setMessagesStatus("error");
        setMessagesError(
          errorMessage(err, "No se pudieron cargar los mensajes."),
        );
      });

    const unsubSocket = subscribeConversationMessages(
      convId,
      (message) => {
        setMessages((prev) => appendUniqueMessage(prev, message));
        if (
          currentUserIdRef.current &&
          message.senderId !== currentUserIdRef.current
        ) {
          if (typingTimerRef.current) {
            clearTimeout(typingTimerRef.current);
            typingTimerRef.current = null;
          }
          setOtherTyping(false);
          setOtherLastReadAt((prev) =>
            !prev || new Date(message.createdAt) > new Date(prev)
              ? message.createdAt
              : prev,
          );
          notifyConversationRead(convId);
          void apiFetchClient<void>(`/api/conversations/${convId}/read`, {
            method: "POST",
          }).catch(() => {});
        }
      },
      (ack) => {
        if (!ack.ok && !cancelled) {
          setMessagesStatus("error");
          setMessagesError("No tienes permiso.");
        }
      },
      {
        onTyping: (userId) => {
          if (
            currentUserIdRef.current &&
            userId === currentUserIdRef.current
          ) {
            return;
          }
          setOtherTyping(true);
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
          typingTimerRef.current = setTimeout(() => {
            setOtherTyping(false);
            typingTimerRef.current = null;
          }, TYPING_INDICATOR_MS);
        },
        onRemoteRead: (readAt, userId) => {
          if (
            currentUserIdRef.current &&
            userId === currentUserIdRef.current
          ) {
            return;
          }
          setOtherLastReadAt((prev) =>
            !prev || new Date(readAt) > new Date(prev) ? readAt : prev,
          );
        },
      },
    );

    return () => {
      cancelled = true;
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      unsubSocket();
    };
  }, [selectedId]);

  function openConversation(id: string, list = conversations) {
    setSelectedId(id);
    selectedIdRef.current = id;
    setMessages([]);
    setNextCursor(null);
    setMessagesStatus("loading");
    setMessagesError(null);
    setSendError(null);
    setOtherTyping(false);
    setOtherLastReadAt(null);
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    const target = list.find((c) => c.id === id);
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)),
    );
    notifyConversationRead(id);
    if (target && target.unread > 0) {
      void apiFetchClient<void>(`/api/conversations/${id}/read`, {
        method: "POST",
      }).catch(() => {});
    }
  }

  async function loadOlderMessages() {
    if (!selectedId || !nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await apiFetchClient<MessagePageDto>(
        `/api/conversations/${selectedId}/messages?cursor=${encodeURIComponent(nextCursor)}`,
      );
      const olderChronological = [...page.items].reverse();
      setMessages((prev) => prependUniqueMessages(olderChronological, prev));
      setNextCursor(page.nextCursor);
    } catch (err) {
      setMessagesError(
        errorMessage(err, "No se pudieron cargar los mensajes anteriores."),
      );
    } finally {
      setLoadingOlder(false);
    }
  }

  function handleMessagesScroll(event: React.UIEvent<HTMLDivElement>) {
    if (event.currentTarget.scrollTop === 0 && nextCursor && !loadingOlder) {
      void loadOlderMessages();
    }
  }

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !selectedId || sending) return;

    setSending(true);
    setSendError(null);
    try {
      const created = await apiFetchClient<MessageDto>(
        `/api/conversations/${selectedId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        },
      );
      setDraft("");
      setMessages((prev) => appendUniqueMessage(prev, created));
      setConversations((prev) => {
        const current = prev.find((c) => c.id === selectedId);
        if (!current) return prev;
        return upsertConversationAtTop(prev, {
          ...current,
          lastMessage: created,
          unread: 0,
        });
      });
    } catch (err) {
      setSendError(
        errorMessage(err, "No se pudo enviar el mensaje. Intenta de nuevo."),
      );
    } finally {
      setSending(false);
    }
  }

  const selectedName = selected
    ? (selected.otherUser.displayName ?? selected.otherUser.username)
    : "";
  const selectedOnline = selected
    ? onlineUserIds.has(selected.otherUser.id)
    : false;
  const myName = currentUser
    ? (currentUser.displayName ?? currentUser.username)
    : "";

  const lastOwnMessageId =
    [...messages].reverse().find((m) => m.senderId === currentUserId)?.id ??
    null;

  return (
    <main className="flex h-[calc(100vh-64px)]">
      <aside
        className={`w-full shrink-0 overflow-y-auto border-r border-border md:flex md:w-80 md:flex-col ${
          selectedId ? "hidden" : "flex flex-col"
        }`}
      >
        {inboxStatus === "loading" && (
          <p className="p-6 text-center text-muted">Cargando…</p>
        )}

        {inboxStatus === "error" && (
          <p className="p-6 text-center text-red-600">{inboxError}</p>
        )}

        {inboxStatus === "ready" && conversations.length === 0 && (
          <p className="p-6 text-center text-muted">
            Todavía no tienes conversaciones.
          </p>
        )}

        {inboxStatus === "ready" &&
          conversations.map((conversation) => {
            const name =
              conversation.otherUser.displayName ??
              conversation.otherUser.username;
            const isActive = conversation.id === selectedId;
            const isOnline = onlineUserIds.has(conversation.otherUser.id);
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => openConversation(conversation.id)}
                className={`flex items-center gap-3 border-b border-border px-4 py-3 text-left hover:bg-surface ${
                  isActive ? "bg-surface" : ""
                }`}
              >
                <div className="relative shrink-0">
                  <Avatar
                    name={name}
                    avatarPublicId={conversation.otherUser.avatarPublicId}
                    size="md"
                  />
                  <span
                    aria-hidden="true"
                    className={`absolute right-0 bottom-0 h-3 w-3 rounded-full ring-2 ring-background ${
                      isOnline ? "bg-emerald-500" : "bg-zinc-400"
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">
                      {name}
                    </span>
                    {conversation.lastMessage && (
                      <span className="shrink-0 text-xs text-muted">
                        {formatRelativeTime(conversation.lastMessage.createdAt)}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm text-muted">
                    {conversation.lastMessage?.content ??
                      "Sin mensajes todavía"}
                  </p>
                </div>
                {conversation.unread > 0 && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-white">
                    {conversation.unread}
                  </span>
                )}
              </button>
            );
          })}
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
              <Link
                href={`/u/${selected.otherUser.username}`}
                className="flex items-center gap-3 hover:underline"
              >
                <div className="relative shrink-0">
                  <Avatar
                    name={selectedName}
                    avatarPublicId={selected.otherUser.avatarPublicId}
                    size="sm"
                  />
                  <span
                    aria-hidden="true"
                    className={`absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full ring-2 ring-background ${
                      selectedOnline ? "bg-emerald-500" : "bg-zinc-400"
                    }`}
                  />
                </div>
                <div className="flex flex-col">
                  <span className="leading-tight font-semibold">
                    {selectedName}
                  </span>
                  <span
                    className={`text-xs ${
                      selectedOnline ? "text-emerald-600" : "text-muted"
                    }`}
                  >
                    {selectedOnline ? "Activo ahora" : "Inactivo"}
                  </span>
                </div>
              </Link>
            </div>

            <div
              onScroll={handleMessagesScroll}
              className="flex flex-1 flex-col gap-2 overflow-y-auto p-4"
            >
              {nextCursor && (
                <div className="flex justify-center pb-2">
                  <button
                    type="button"
                    onClick={loadOlderMessages}
                    disabled={loadingOlder}
                    className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-muted hover:bg-surface disabled:opacity-50"
                  >
                    {loadingOlder
                      ? "Cargando…"
                      : "Cargar mensajes anteriores"}
                  </button>
                </div>
              )}

              {messagesStatus === "loading" && (
                <p className="py-10 text-center text-muted">Cargando…</p>
              )}

              {messagesError && (
                <p className="py-4 text-center text-sm text-red-600">
                  {messagesError}
                </p>
              )}

              {messagesStatus === "ready" && messages.length === 0 && (
                <p className="py-10 text-center text-sm text-muted">
                  Aún no hay mensajes. Envía el primero para iniciar la
                  conversación.
                </p>
              )}

              {messages.map((message) => {
                const fromMe = message.senderId === currentUserId;
                const isLastOwn = fromMe && message.id === lastOwnMessageId;
                const isSeen =
                  isLastOwn &&
                  otherLastReadAt !== null &&
                  new Date(message.createdAt).getTime() <=
                    new Date(otherLastReadAt).getTime();
                return (
                  <div
                    key={message.id}
                    className={`flex flex-col ${fromMe ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`flex max-w-[80%] items-end gap-2 ${
                        fromMe ? "flex-row-reverse" : "flex-row"
                      }`}
                    >
                      <Avatar
                        name={fromMe ? myName : selectedName}
                        avatarPublicId={
                          fromMe
                            ? currentUser?.avatarPublicId
                            : selected.otherUser.avatarPublicId
                        }
                        size="xs"
                      />
                      <div
                        className={`whitespace-pre-line rounded-2xl px-3 py-2 text-sm ${
                          fromMe
                            ? "rounded-br-sm bg-primary text-white"
                            : "rounded-bl-sm bg-surface text-foreground"
                        }`}
                      >
                        {message.content}
                      </div>
                    </div>
                    <span
                      className={`mt-0.5 text-xs text-muted ${
                        fromMe ? "mr-9" : "ml-9"
                      }`}
                    >
                      {formatRelativeTime(message.createdAt)}
                      {isLastOwn && <> · {isSeen ? "Visto" : "Enviado"}</>}
                    </span>
                  </div>
                );
              })}

              {otherTyping && (
                <div className="flex items-end gap-2">
                  <Avatar
                    name={selectedName}
                    avatarPublicId={selected.otherUser.avatarPublicId}
                    size="xs"
                  />
                  <p
                    role="status"
                    className="rounded-2xl rounded-bl-sm bg-surface px-3 py-2 text-xs italic text-muted"
                  >
                    {selectedName} está escribiendo…
                  </p>
                </div>
              )}
            </div>

            {sendError && (
              <p className="px-4 pt-2 text-sm text-red-600">{sendError}</p>
            )}

            <form
              noValidate
              onSubmit={handleSend}
              className="flex items-center gap-2 border-t border-border p-3"
            >
              <label htmlFor="chat-message-input" className="sr-only">
                Escribe un mensaje
              </label>
              <input
                id="chat-message-input"
                type="text"
                value={draft}
                onChange={(e) => {
                  const next = e.target.value;
                  setDraft(next);
                  if (selectedId && next.trim().length > 0) {
                    emitConversationTyping(selectedId);
                  }
                }}
                maxLength={MESSAGE_MAX}
                placeholder="Escribe un mensaje..."
                className="flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-primary"
              />
              <button
                type="submit"
                disabled={sending || draft.trim().length === 0}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? "Enviando…" : "Enviar"}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={<p className="p-6 text-center text-muted">Cargando…</p>}
    >
      <ChatView />
    </Suspense>
  );
}
