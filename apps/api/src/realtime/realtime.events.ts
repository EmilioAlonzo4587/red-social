// Eventos de Socket.io de docs/05-api.md. Socket.io usa estas interfaces para revisar el nombre
// y los datos de cada emit: un evento que no está aquí no compila.

// Servidor → cliente
export interface ServerToClientEvents {
  'session:ready': (data: { userId: string }) => void;
}

// Lo que el middleware del handshake guarda en cada socket
export interface SocketData {
  userId: string;
  /** Vencimiento del JWT del handshake, en milisegundos. */
  expiresAt: number;
}

export const userRoom = (userId: string) => `user:${userId}`;
