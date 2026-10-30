import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  disconnectSocket,
  emitConversationTyping,
  notifyConversationRead,
  subscribeConversationMessages,
  subscribeConversationRead,
  subscribeConversationUpdated,
  subscribePostComments,
  subscribePostLikes,
  watchUsersPresence,
} from "./socket";

type Handler = (...args: unknown[]) => void;

const { ioMock, emit, connect, disconnect, trigger, resetHandlers } =
  vi.hoisted(() => {
    const handlers = new Map<string, Handler[]>();
    const emit = vi.fn();
    const connect = vi.fn();
    const disconnect = vi.fn();

    const fakeSocket = {
      on: vi.fn((event: string, fn: Handler) => {
        const list = handlers.get(event) ?? [];
        list.push(fn);
        handlers.set(event, list);
      }),
      emit,
      connect,
      disconnect,
    };

    const ioMock = vi.fn(() => fakeSocket);
    const trigger = (event: string, ...args: unknown[]) => {
      for (const fn of handlers.get(event) ?? []) {
        fn(...args);
      }
    };
    const resetHandlers = () => {
      handlers.clear();
    };

    return { ioMock, emit, connect, disconnect, trigger, resetHandlers };
  });

vi.mock("socket.io-client", () => ({ io: ioMock }));

const { refreshSession } = vi.hoisted(() => ({ refreshSession: vi.fn() }));
vi.mock("./api-client", () => ({ refreshSession }));

describe("socket (S2-03)", () => {
  beforeEach(() => {
    disconnectSocket();
    resetHandlers();
    ioMock.mockClear();
    emit.mockClear();
    connect.mockClear();
    disconnect.mockClear();
    refreshSession.mockReset();
  });

  it("conecta con withCredentials: true y agrupa post:watch y post:unwatch", async () => {
    const l1 = vi.fn();
    const l2 = vi.fn();

    const unsub1 = subscribePostLikes("p1", l1);
    const unsub2 = subscribePostLikes("p2", l2);

    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(ioMock).toHaveBeenCalledWith(undefined, { withCredentials: true });

    await Promise.resolve();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("post:watch", { postIds: ["p1", "p2"] });

    trigger("post:likes", { postId: "p1", likeCount: 9 });
    expect(l1).toHaveBeenCalledWith(9);
    expect(l2).not.toHaveBeenCalled();

    emit.mockClear();
    unsub1();
    unsub2();
    await Promise.resolve();

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("post:unwatch", {
      postIds: ["p1", "p2"],
    });
  });

  it("si se reconecta tras una desconexión, vuelve a enviar post:watch con las publicaciones activas", async () => {
    const unsub = subscribePostLikes("p1", vi.fn());
    await Promise.resolve();
    emit.mockClear();

    trigger("disconnect", "transport close");
    trigger("connect");

    expect(emit).toHaveBeenCalledWith("post:watch", { postIds: ["p1"] });
    unsub();
  });

  it("manda post:watch y post:unwatch en bloques de 100 ids (límite del servidor)", async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `p${i}`);
    const unsubs = ids.map((id) => subscribePostLikes(id, vi.fn()));
    await Promise.resolve();

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenNthCalledWith(1, "post:watch", {
      postIds: ids.slice(0, 100),
    });
    expect(emit).toHaveBeenNthCalledWith(2, "post:watch", {
      postIds: ids.slice(100),
    });

    // Al reconectar se reenvían todas las activas, también en bloques
    emit.mockClear();
    trigger("disconnect", "transport close");
    trigger("connect");
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenNthCalledWith(2, "post:watch", {
      postIds: ids.slice(100),
    });

    emit.mockClear();
    for (const unsub of unsubs) unsub();
    await Promise.resolve();
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenNthCalledWith(1, "post:unwatch", {
      postIds: ids.slice(0, 100),
    });
  });

  it("ante connect_error unauthorized o io server disconnect, refresca la sesión y reconecta", async () => {
    refreshSession.mockResolvedValue(true);
    const unsub = subscribePostLikes("p1", vi.fn());

    trigger("connect_error", new Error("unauthorized"));
    await vi.waitFor(() => {
      expect(refreshSession).toHaveBeenCalledTimes(1);
      expect(connect).toHaveBeenCalledTimes(1);
    });

    // Conectó con la sesión renovada; más tarde el servidor lo cierra al vencer el JWT
    trigger("connect");
    trigger("disconnect", "io server disconnect");
    await vi.waitFor(() => {
      expect(refreshSession).toHaveBeenCalledTimes(2);
      expect(connect).toHaveBeenCalledTimes(2);
    });

    unsub();
  });

  it("si el handshake vuelve a fallar tras renovar la sesión, no repite el refresh", async () => {
    refreshSession.mockResolvedValue(true);
    const unsub = subscribePostLikes("p1", vi.fn());

    trigger("connect_error", new Error("unauthorized"));
    await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(1));

    // Sin un connect de por medio: el refresh no sirvió, se detiene
    trigger("connect_error", new Error("unauthorized"));
    await Promise.resolve();
    await Promise.resolve();
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);

    unsub();
  });

  it("disconnectSocket cierra la conexión activa", () => {
    const unsub = subscribePostLikes("p1", vi.fn());
    disconnectSocket();
    expect(disconnect).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("post:comments llega solo a quien está suscrito a esa publicación (S3-18)", async () => {
    const l1 = vi.fn();
    const l2 = vi.fn();

    const unsub1 = subscribePostComments("p1", l1);
    const unsub2 = subscribePostComments("p2", l2);
    await Promise.resolve();

    trigger("post:comments", { postId: "p1", commentCount: 4 });
    expect(l1).toHaveBeenCalledWith(4);
    expect(l2).not.toHaveBeenCalled();

    unsub1();
    unsub2();
  });

  it("una publicación mirada por like y por comentario solo manda un post:watch y un post:unwatch (S3-18)", async () => {
    const likeListener = vi.fn();
    const commentListener = vi.fn();

    const unsubLike = subscribePostLikes("p1", likeListener);
    const unsubComment = subscribePostComments("p1", commentListener);
    await Promise.resolve();

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("post:watch", { postIds: ["p1"] });

    // Se va el listener de likes: todavía hay uno de comentarios, así que sigue mirando la sala
    emit.mockClear();
    unsubLike();
    await Promise.resolve();
    expect(emit).not.toHaveBeenCalled();

    trigger("post:comments", { postId: "p1", commentCount: 2 });
    expect(commentListener).toHaveBeenCalledWith(2);

    // Se va el último: ahí sí deja de mirarla
    unsubComment();
    await Promise.resolve();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("post:unwatch", { postIds: ["p1"] });
  });

  it("subscribeConversationMessages emite conversation:join, recibe message:new y reenvía join al reconectar (S3-06)", () => {
    const onMessage = vi.fn();
    const onJoinResult = vi.fn();

    const unsub = subscribeConversationMessages("c1", onMessage, onJoinResult);
    expect(emit).toHaveBeenCalledWith(
      "conversation:join",
      { conversationId: "c1" },
      expect.any(Function),
    );

    const ackFn = emit.mock.calls[0]?.[2] as (ack: { ok: true }) => void;
    ackFn({ ok: true });
    expect(onJoinResult).toHaveBeenCalledWith({ ok: true });

    const msg1 = {
      id: "m1",
      conversationId: "c1",
      senderId: "u2",
      content: "Hola",
      createdAt: "2026-10-30T15:00:00.000Z",
    };
    const msgOther = { ...msg1, id: "m2", conversationId: "c2" };
    trigger("message:new", msgOther);
    expect(onMessage).not.toHaveBeenCalled();

    trigger("message:new", msg1);
    expect(onMessage).toHaveBeenCalledWith(msg1);

    // Al reconectar tras desconexión, vuelve a mandar conversation:join
    emit.mockClear();
    trigger("disconnect", "transport close");
    trigger("connect");
    expect(emit).toHaveBeenCalledWith(
      "conversation:join",
      { conversationId: "c1" },
      expect.any(Function),
    );

    unsub();
  });

  it("subscribeConversationUpdated y subscribeConversationRead notifican cambios de bandeja y lectura (S3-06)", () => {
    const onUpdated = vi.fn();
    const onRead = vi.fn();

    const unsubUpdated = subscribeConversationUpdated(onUpdated);
    const unsubRead = subscribeConversationRead(onRead);

    const conv = {
      id: "c1",
      otherUser: {
        id: "u2",
        username: "beto",
        displayName: "Beto",
        avatarPublicId: null,
      },
      lastMessage: null,
      unread: 2,
    };
    trigger("conversation:updated", conv);
    expect(onUpdated).toHaveBeenCalledWith(conv);

    notifyConversationRead("c1");
    expect(onRead).toHaveBeenCalledWith("c1");

    unsubUpdated();
    unsubRead();
  });

  it("recibe conversation:typing y conversation:read, y limita emitConversationTyping (S3-06)", () => {
    const onTyping = vi.fn();
    const onRemoteRead = vi.fn();

    const unsub = subscribeConversationMessages("c1", vi.fn(), undefined, {
      onTyping,
      onRemoteRead,
    });
    emit.mockClear();

    emitConversationTyping("c1");
    emitConversationTyping("c1"); // dentro de la ventana de 2 s: se ignora
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("conversation:typing", {
      conversationId: "c1",
    });

    trigger("conversation:typing", { conversationId: "c1", userId: "u2" });
    expect(onTyping).toHaveBeenCalledWith("u2");

    trigger("conversation:read", {
      conversationId: "c1",
      userId: "u2",
      readAt: "2026-10-30T15:00:00.000Z",
    });
    expect(onRemoteRead).toHaveBeenCalledWith(
      "2026-10-30T15:00:00.000Z",
      "u2",
    );

    unsub();
  });

  it("watchUsersPresence emite presence:watch, procesa el ack y escucha user:presence (S3-06)", () => {
    const onPresence = vi.fn();
    const unsub = watchUsersPresence(["u2", "u3"], onPresence);

    expect(emit).toHaveBeenCalledWith(
      "presence:watch",
      { userIds: ["u2", "u3"] },
      expect.any(Function),
    );

    const ackFn = emit.mock.calls[0]?.[2] as (ack: {
      onlineUserIds: string[];
    }) => void;
    ackFn({ onlineUserIds: ["u2"] });
    expect(onPresence).toHaveBeenLastCalledWith(new Set(["u2"]));

    trigger("user:presence", { userId: "u3", online: true });
    expect(onPresence).toHaveBeenLastCalledWith(new Set(["u2", "u3"]));

    trigger("user:presence", { userId: "u2", online: false });
    expect(onPresence).toHaveBeenLastCalledWith(new Set(["u3"]));

    unsub();
  });
});
