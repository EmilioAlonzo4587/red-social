import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  PostCommentsEvent,
  PostLikesEvent,
  ServerToClientEvents,
} from "@red/api-types";
import { refreshSession } from "./api-client";

export type AppClientSocket = Socket<
  ServerToClientEvents,
  ClientToServerEvents
>;

type LikeCountListener = (likeCount: number) => void;
type CommentCountListener = (commentCount: number) => void;

// El servidor rechaza entero un post:watch/post:unwatch con más de 100 ids
// (MAX_WATCH_POST_IDS de la api), así que se mandan en bloques de ese tamaño.
const MAX_IDS_PER_EVENT = 100;

let socket: AppClientSocket | null = null;
let needsResubscribe = false;
let flushScheduled = false;
// Un solo refresh por desconexión: si tras renovar la sesión el handshake vuelve a fallar
// (por ejemplo, la cookie no viaja), no se insiste. Sin esto, connect_error → refresh →
// connect se repetiría sin fin, rotando el token de renovación en cada vuelta.
// Vuelve a false cuando el socket conecta.
let refreshAttempted = false;

const likeListenersByPost = new Map<string, Set<LikeCountListener>>();
const commentListenersByPost = new Map<string, Set<CommentCountListener>>();
const pendingWatch = new Set<string>();
const pendingUnwatch = new Set<string>();

// post:{id} se comparte entre likes y comentarios (S3-18): solo se deja de mirar
// cuando ninguna de las dos razones sigue suscrita.
function isWatched(postId: string): boolean {
  return likeListenersByPost.has(postId) || commentListenersByPost.has(postId);
}

async function reconnectAfterRefresh(target: AppClientSocket): Promise<void> {
  if (socket !== target || refreshAttempted) return;
  refreshAttempted = true;
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
    const set = likeListenersByPost.get(postId);
    if (!set) return;
    for (const listener of set) {
      listener(likeCount);
    }
  });

  instance.on("post:comments", ({ postId, commentCount }: PostCommentsEvent) => {
    const set = commentListenersByPost.get(postId);
    if (!set) return;
    for (const listener of set) {
      listener(commentCount);
    }
  });

  instance.on("connect", () => {
    refreshAttempted = false;
    if (!needsResubscribe) return;
    needsResubscribe = false;
    const activeIds = [
      ...new Set([
        ...likeListenersByPost.keys(),
        ...commentListenersByPost.keys(),
      ]),
    ];
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
 * Suscribe una tarjeta a los cambios en vivo de un contador (likes o comentarios, S2-03/S3-18)
 * de una publicación. Agrupa en el mismo microtask las altas y bajas de todas las tarjetas que
 * se montan o desmontan juntas (por ejemplo una página de 20 publicaciones en el feed), y solo
 * manda post:watch/post:unwatch cuando nadie más sigue mirando esa publicación por la otra razón.
 */
function subscribeToPost<T>(
  listenersByPost: Map<string, Set<T>>,
  postId: string,
  listener: T,
): () => void {
  const activeSocket = getSocket();
  const alreadyWatched = isWatched(postId);
  let set = listenersByPost.get(postId);
  if (!set) {
    set = new Set();
    listenersByPost.set(postId, set);
  }
  set.add(listener);
  if (!alreadyWatched) {
    if (pendingUnwatch.has(postId)) {
      pendingUnwatch.delete(postId);
    } else {
      pendingWatch.add(postId);
      scheduleFlush();
    }
  }

  return () => {
    const currentSet = listenersByPost.get(postId);
    if (!currentSet) return;
    currentSet.delete(listener);
    if (currentSet.size > 0) return;

    listenersByPost.delete(postId);
    if (isWatched(postId)) return;
    if (pendingWatch.has(postId)) {
      pendingWatch.delete(postId);
    } else if (socket === activeSocket) {
      pendingUnwatch.add(postId);
      scheduleFlush();
    }
  };
}

export function subscribePostLikes(
  postId: string,
  onLikeCount: LikeCountListener,
): () => void {
  return subscribeToPost(likeListenersByPost, postId, onLikeCount);
}

export function subscribePostComments(
  postId: string,
  onCommentCount: CommentCountListener,
): () => void {
  return subscribeToPost(commentListenersByPost, postId, onCommentCount);
}

/**
 * Cierra el socket antes de POST /api/auth/logout (docs/05-api.md).
 */
export function disconnectSocket(): void {
  pendingWatch.clear();
  pendingUnwatch.clear();
  needsResubscribe = false;
  refreshAttempted = false;
  if (!socket) return;
  const current = socket;
  socket = null;
  current.disconnect();
}
