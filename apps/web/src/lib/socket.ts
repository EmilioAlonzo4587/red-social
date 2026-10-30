import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  PostLikesEvent,
  ServerToClientEvents,
} from "@red/api-types";
import { refreshSession } from "./api-client";

export type AppClientSocket = Socket<
  ServerToClientEvents,
  ClientToServerEvents
>;

type LikeCountListener = (likeCount: number) => void;

// El servidor rechaza entero un post:watch/post:unwatch con más de 100 ids
// (MAX_WATCH_POST_IDS de la api), así que se mandan en bloques de ese tamaño.
const MAX_IDS_PER_EVENT = 100;

let socket: AppClientSocket | null = null;
let needsResubscribe = false;
let flushScheduled = false;

const listenersByPost = new Map<string, Set<LikeCountListener>>();
const pendingWatch = new Set<string>();
const pendingUnwatch = new Set<string>();

async function reconnectAfterRefresh(target: AppClientSocket): Promise<void> {
  if (socket !== target) return;
  const refreshed = await refreshSession();
  if (socket !== target) return;
  if (!refreshed) {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
    return;
  }
  target.connect();
}

function emitInChunks(
  target: AppClientSocket,
  event: "post:watch" | "post:unwatch",
  postIds: string[],
): void {
  for (let i = 0; i < postIds.length; i += MAX_IDS_PER_EVENT) {
    target.emit(event, { postIds: postIds.slice(i, i + MAX_IDS_PER_EVENT) });
  }
}

function getSocket(): AppClientSocket {
  if (socket) return socket;

  const instance: AppClientSocket = io(
    process.env.NEXT_PUBLIC_SOCKET_URL || undefined,
    { withCredentials: true },
  );
  socket = instance;
  needsResubscribe = false;

  instance.on("post:likes", ({ postId, likeCount }: PostLikesEvent) => {
    const set = listenersByPost.get(postId);
    if (!set) return;
    for (const listener of set) {
      listener(likeCount);
    }
  });

  instance.on("connect", () => {
    if (!needsResubscribe) return;
    needsResubscribe = false;
    const activeIds = [...listenersByPost.keys()];
    for (const id of activeIds) {
      pendingWatch.delete(id);
    }
    emitInChunks(instance, "post:watch", activeIds);
  });

  instance.on("disconnect", (reason) => {
    needsResubscribe = true;
    // El servidor cierra el socket al vencer el JWT (S1-04, docs/05-api.md);
    // Socket.io no reconecta solo ante "io server disconnect".
    if (reason === "io server disconnect") {
      void reconnectAfterRefresh(instance);
    }
  });

  instance.on("connect_error", (error) => {
    if (error.message === "unauthorized") {
      void reconnectAfterRefresh(instance);
    }
  });

  return instance;
}

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    if (!socket) {
      pendingWatch.clear();
      pendingUnwatch.clear();
      return;
    }
    const toWatch = [...pendingWatch];
    const toUnwatch = [...pendingUnwatch];
    pendingWatch.clear();
    pendingUnwatch.clear();
    emitInChunks(socket, "post:watch", toWatch);
    emitInChunks(socket, "post:unwatch", toUnwatch);
  });
}

/**
 * Suscribe una tarjeta de publicación a los cambios de contador de likes en vivo (S2-03).
 * Agrupa en el mismo microtask las altas y bajas de todas las tarjetas que se montan
 * o desmontan juntas (por ejemplo una página de 20 publicaciones en el feed).
 */
export function subscribePostLikes(
  postId: string,
  onLikeCount: LikeCountListener,
): () => void {
  const activeSocket = getSocket();
  let set = listenersByPost.get(postId);
  if (!set) {
    set = new Set();
    listenersByPost.set(postId, set);
    if (pendingUnwatch.has(postId)) {
      pendingUnwatch.delete(postId);
    } else {
      pendingWatch.add(postId);
      scheduleFlush();
    }
  }
  set.add(onLikeCount);

  return () => {
    const currentSet = listenersByPost.get(postId);
    if (!currentSet) return;
    currentSet.delete(onLikeCount);
    if (currentSet.size > 0) return;

    listenersByPost.delete(postId);
    if (pendingWatch.has(postId)) {
      pendingWatch.delete(postId);
    } else if (socket === activeSocket) {
      pendingUnwatch.add(postId);
      scheduleFlush();
    }
  };
}

/**
 * Cierra el socket antes de POST /api/auth/logout (docs/05-api.md).
 */
export function disconnectSocket(): void {
  pendingWatch.clear();
  pendingUnwatch.clear();
  needsResubscribe = false;
  if (!socket) return;
  const current = socket;
  socket = null;
  current.disconnect();
}
