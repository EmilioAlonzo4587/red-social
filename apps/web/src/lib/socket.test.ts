import { beforeEach, describe, expect, it, vi } from "vitest";
import { disconnectSocket, subscribePostLikes } from "./socket";

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

  it("ante connect_error unauthorized o io server disconnect, refresca la sesión y reconecta", async () => {
    refreshSession.mockResolvedValue(true);
    const unsub = subscribePostLikes("p1", vi.fn());

    trigger("connect_error", new Error("unauthorized"));
    await vi.waitFor(() => {
      expect(refreshSession).toHaveBeenCalledTimes(1);
      expect(connect).toHaveBeenCalledTimes(1);
    });

    trigger("disconnect", "io server disconnect");
    await vi.waitFor(() => {
      expect(refreshSession).toHaveBeenCalledTimes(2);
      expect(connect).toHaveBeenCalledTimes(2);
    });

    unsub();
  });

  it("disconnectSocket cierra la conexión activa", () => {
    const unsub = subscribePostLikes("p1", vi.fn());
    disconnectSocket();
    expect(disconnect).toHaveBeenCalledTimes(1);
    unsub();
  });
});
