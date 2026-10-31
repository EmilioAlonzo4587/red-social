import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ConversationJoinAck,
  ConversationReadEvent,
  ConversationTypingEvent,
  ConversationUpdatedEvent,
  FeedNewEvent,
  MessageNewEvent,
  NotificationNewEvent,
  PostCommentsEvent,
  PostLikesEvent,
  ServerToClientEvents,
  UserPresenceEvent,
} from "@red/api-types";
import { refreshSession } from "./api-client";

export type AppClientSocket = Socket<
  ServerToClientEvents,
  ClientToServerEvents
>;

type LikeCountListener = (likeCount: number) => void;
type CommentCountListener = (commentCount: number) => void;
type MessageListener = (message: MessageNewEvent) => void;
type ConversationJoinResultListener = (ack: ConversationJoinAck) => void;
type TypingListener = (userId: string) => void;
type RemoteReadListener = (readAt: string, userId: string) => void;
type ConversationUpdatedListener = (
  conversation: ConversationUpdatedEvent,
) => void;
type ConversationReadListener = (conversationId: string) => void;
type PresenceListener = (onlineUserIds: ReadonlySet<string>) => void;
type NotificationNewListener = (notification: NotificationNewEvent) => void;
export type NotificationsReadEvent = { decrement?: number; all?: boolean };
type NotificationsReadListener = (event: NotificationsReadEvent) => void;
type FeedNewListener = (event: FeedNewEvent) => void;

export interface ConversationSubscriptionOptions {
  onTyping?: TypingListener;
  onRemoteRead?: RemoteReadListener;
}

const TYPING_THROTTLE_MS = 2000;

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
const messageListenersByConversation = new Map<string, Set<MessageListener>>();
const joinResultListenersByConversation = new Map<
  string,
  Set<ConversationJoinResultListener>
>();
const typingListenersByConversation = new Map<string, Set<TypingListener>>();
const remoteReadListenersByConversation = new Map<
  string,
  Set<RemoteReadListener>
>();
const lastRemoteReadByConversation = new Map<
  string,
  { userId: string; readAt: string }
>();
const lastTypingEmitByConversation = new Map<string, number>();
const conversationUpdatedListeners = new Set<ConversationUpdatedListener>();
const conversationReadListeners = new Set<ConversationReadListener>();
const presenceListeners = new Set<PresenceListener>();
const notificationNewListeners = new Set<NotificationNewListener>();
const notificationsReadListeners = new Set<NotificationsReadListener>();
const feedNewListeners = new Set<FeedNewListener>();
const watchedPresenceUsers = new Set<string>();
const onlineUsers = new Set<string>();
const pendingWatch = new Set<string>();
const pendingUnwatch = new Set<string>();
let activeChatUserId: string | null = null;

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

function emitConversationJoin(
  target: AppClientSocket,
  conversationId: string,
): void {
  target.emit("conversation:join", { conversationId }, (ack) => {
    const set = joinResultListenersByConversation.get(conversationId);
    if (!set) return;
    for (const listener of set) {
      listener(ack);
    }
  });
}

function notifyPresenceListeners(): void {
  const snapshot = new Set(onlineUsers);
  for (const listener of presenceListeners) {
    listener(snapshot);
  }
}

function emitPresenceWatch(target: AppClientSocket, userIds: string[]): void {
  for (let i = 0; i < userIds.length; i += MAX_IDS_PER_EVENT) {
    const chunk = userIds.slice(i, i + MAX_IDS_PER_EVENT);
    target.emit("presence:watch", { userIds: chunk }, (ack) => {
      const activeSet = new Set(ack.onlineUserIds);
      for (const id of chunk) {
        if (activeSet.has(id)) {
          onlineUsers.add(id);
        } else {
          onlineUsers.delete(id);
        }
      }
      notifyPresenceListeners();
    });
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

  instance.on("message:new", (message: MessageNewEvent) => {
    const set = messageListenersByConversation.get(message.conversationId);
    if (!set) return;
    for (const listener of set) {
      listener(message);
    }
  });

  instance.on(
    "conversation:updated",
    (conversation: ConversationUpdatedEvent) => {
      for (const listener of conversationUpdatedListeners) {
        listener(conversation);
      }
    },
  );

  instance.on(
    "conversation:typing",
    ({ conversationId, userId }: ConversationTypingEvent) => {
      const set = typingListenersByConversation.get(conversationId);
      if (!set) return;
      for (const listener of set) {
        listener(userId);
      }
    },
  );

  instance.on(
    "conversation:read",
    ({ conversationId, userId, readAt }: ConversationReadEvent) => {
      lastRemoteReadByConversation.set(conversationId, { userId, readAt });
      const set = remoteReadListenersByConversation.get(conversationId);
      if (!set) return;
      for (const listener of set) {
        listener(readAt, userId);
      }
    },
  );

  instance.on("user:presence", ({ userId, online }: UserPresenceEvent) => {
    if (online) {
      onlineUsers.add(userId);
    } else {
      onlineUsers.delete(userId);
    }
    notifyPresenceListeners();
  });

  instance.on("notification:new", (notification: NotificationNewEvent) => {
    for (const listener of notificationNewListeners) {
      listener(notification);
    }
  });

  instance.on("feed:new", (event: FeedNewEvent) => {
    for (const listener of feedNewListeners) {
      listener(event);
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
    for (const conversationId of messageListenersByConversation.keys()) {
      emitConversationJoin(instance, conversationId);
    }
    if (watchedPresenceUsers.size > 0) {
      emitPresenceWatch(instance, [...watchedPresenceUsers]);
    }
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
 * Une el socket a la sala conv:{id} con conversation:join y escucha message:new
 * de esa conversación (S3-05, S3-06). Al reconectar vuelve a mandar conversation:join.
 */
export function subscribeConversationMessages(
  conversationId: string,
  onMessage: MessageListener,
  onJoinResult?: ConversationJoinResultListener,
  options?: ConversationSubscriptionOptions,
): () => void {
  const activeSocket = getSocket();
  const alreadyJoined = messageListenersByConversation.has(conversationId);

  let messageSet = messageListenersByConversation.get(conversationId);
  if (!messageSet) {
    messageSet = new Set();
    messageListenersByConversation.set(conversationId, messageSet);
  }
  messageSet.add(onMessage);

  if (onJoinResult) {
    let joinSet = joinResultListenersByConversation.get(conversationId);
    if (!joinSet) {
      joinSet = new Set();
      joinResultListenersByConversation.set(conversationId, joinSet);
    }
    joinSet.add(onJoinResult);
  }

  if (options?.onTyping) {
    let typingSet = typingListenersByConversation.get(conversationId);
    if (!typingSet) {
      typingSet = new Set();
      typingListenersByConversation.set(conversationId, typingSet);
    }
    typingSet.add(options.onTyping);
  }

  if (options?.onRemoteRead) {
    let readSet = remoteReadListenersByConversation.get(conversationId);
    if (!readSet) {
      readSet = new Set();
      remoteReadListenersByConversation.set(conversationId, readSet);
    }
    readSet.add(options.onRemoteRead);
    const cached = lastRemoteReadByConversation.get(conversationId);
    if (cached) {
      options.onRemoteRead(cached.readAt, cached.userId);
    }
  }

  if (!alreadyJoined) {
    emitConversationJoin(activeSocket, conversationId);
  }

  return () => {
    const currentMessages = messageListenersByConversation.get(conversationId);
    if (currentMessages) {
      currentMessages.delete(onMessage);
      if (currentMessages.size === 0) {
        messageListenersByConversation.delete(conversationId);
      }
    }
    if (onJoinResult) {
      const currentJoins =
        joinResultListenersByConversation.get(conversationId);
      if (currentJoins) {
        currentJoins.delete(onJoinResult);
        if (currentJoins.size === 0) {
          joinResultListenersByConversation.delete(conversationId);
        }
      }
    }
    if (options?.onTyping) {
      const currentTypings = typingListenersByConversation.get(conversationId);
      if (currentTypings) {
        currentTypings.delete(options.onTyping);
        if (currentTypings.size === 0) {
          typingListenersByConversation.delete(conversationId);
        }
      }
    }
    if (options?.onRemoteRead) {
      const currentReads =
        remoteReadListenersByConversation.get(conversationId);
      if (currentReads) {
        currentReads.delete(options.onRemoteRead);
        if (currentReads.size === 0) {
          remoteReadListenersByConversation.delete(conversationId);
        }
      }
    }
  };
}

/**
 * Emite conversation:typing como máximo una vez cada 2 segundos por conversación.
 */
export function emitConversationTyping(conversationId: string): void {
  if (!socket) return;
  const now = Date.now();
  const last = lastTypingEmitByConversation.get(conversationId) ?? 0;
  if (now - last < TYPING_THROTTLE_MS) return;
  lastTypingEmitByConversation.set(conversationId, now);
  socket.emit("conversation:typing", { conversationId });
}

/**
 * Escucha conversation:updated en la sala personal user:{id} (S3-05, S3-06).
 */
export function subscribeConversationUpdated(
  onConversationUpdated: ConversationUpdatedListener,
): () => void {
  getSocket();
  conversationUpdatedListeners.add(onConversationUpdated);
  return () => {
    conversationUpdatedListeners.delete(onConversationUpdated);
  };
}

/**
 * Avisa en el cliente cuando una conversación se marca como leída en /chat,
 * para que el contador del menú lateral (Sidebar) descuente sus no leídos al instante.
 */
export function subscribeConversationRead(
  onConversationRead: ConversationReadListener,
): () => void {
  conversationReadListeners.add(onConversationRead);
  return () => {
    conversationReadListeners.delete(onConversationRead);
  };
}

export function notifyConversationRead(conversationId: string): void {
  for (const listener of conversationReadListeners) {
    listener(conversationId);
  }
}

/**
 * Escucha notification:new en la sala personal user:{id} (S3-05, S4-11).
 */
export function subscribeNotificationNew(
  onNotification: NotificationNewListener,
): () => void {
  getSocket();
  notificationNewListeners.add(onNotification);
  return () => {
    notificationNewListeners.delete(onNotification);
  };
}

/**
 * Sincroniza el contador de notificaciones sin leer del menú lateral cuando
 * se marca una o todas como leídas desde el panel o el aviso emergente (S4-11).
 */
export function subscribeNotificationsRead(
  onRead: NotificationsReadListener,
): () => void {
  notificationsReadListeners.add(onRead);
  return () => {
    notificationsReadListeners.delete(onRead);
  };
}

export function notifyNotificationsRead(event: NotificationsReadEvent): void {
  for (const listener of notificationsReadListeners) {
    listener(event);
  }
}

/**
 * Escucha feed:new en la sala personal user:{id} cuando alguien seguido publica (S4-11, D11).
 */
export function subscribeFeedNew(onFeedNew: FeedNewListener): () => void {
  getSocket();
  feedNewListeners.add(onFeedNew);
  return () => {
    feedNewListeners.delete(onFeedNew);
  };
}

/**
 * Registra con qué usuario está abierta actualmente la conversación en /chat,
 * para no mostrar el aviso emergente de mensaje de esa conversación (S4-11).
 */
export function setActiveChatUser(userId: string | null): void {
  activeChatUserId = userId;
}

export function getActiveChatUser(): string | null {
  return activeChatUserId;
}

/**
 * Suscribe el socket al estado activo/inactivo (user:presence) de una lista de usuarios.
 */
export function watchUsersPresence(
  userIds: string[],
  onPresenceChange: PresenceListener,
): () => void {
  const activeSocket = getSocket();
  presenceListeners.add(onPresenceChange);
  onPresenceChange(new Set(onlineUsers));

  const newIds = [...new Set(userIds)].filter(
    (id) => !watchedPresenceUsers.has(id),
  );
  for (const id of newIds) {
    watchedPresenceUsers.add(id);
  }
  if (newIds.length > 0) {
    emitPresenceWatch(activeSocket, newIds);
  }

  return () => {
    presenceListeners.delete(onPresenceChange);
  };
}

/**
 * Cierra el socket antes de POST /api/auth/logout (docs/05-api.md).
 */
export function disconnectSocket(): void {
  pendingWatch.clear();
  pendingUnwatch.clear();
  lastRemoteReadByConversation.clear();
  lastTypingEmitByConversation.clear();
  watchedPresenceUsers.clear();
  onlineUsers.clear();
  activeChatUserId = null;
  needsResubscribe = false;
  refreshAttempted = false;
  if (!socket) return;
  const current = socket;
  socket = null;
  current.disconnect();
}
