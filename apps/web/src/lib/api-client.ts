import { toApiError } from "./api-error";
import { disconnectSocket } from "./socket";

let refreshPromise: Promise<boolean> | null = null;

// Un solo refresh a la vez: dentro de la pestaña se comparte la misma promesa;
// entre pestañas, el candado de Web Locks evita que dos pestañas rotén el mismo
// refresh_token a la vez (RN12: reutilizar un token ya rotado cierra todas las sesiones).
async function requestRefreshLock(): Promise<boolean> {
  return await navigator.locks.request("auth-refresh", async () => {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
    return res.ok;
  });
}

export function refreshSession(): Promise<boolean> {
  refreshPromise ??= requestRefreshLock().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

// En estas rutas un 401 no es una sesión vencida: es la propia respuesta (credenciales
// incorrectas en login, refresh rechazado). Intentar refrescar y mandar a la portada
// recargaría la página y el formulario nunca mostraría el error.
const NO_REFRESH_PATHS = ["/api/auth/login", "/api/auth/register", "/api/auth/refresh"];

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * Llama a la api desde el navegador (cookies HttpOnly, D03). Si recibe un 401, intenta
 * refrescar la sesión una vez; si falla, manda a la portada, igual que proxy.ts.
 * `path` empieza con "/api/...".
 */
export async function apiFetchClient<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "include" });

  if (response.status !== 401 || NO_REFRESH_PATHS.includes(path)) {
    return parse<T>(response);
  }

  const refreshed = await refreshSession();
  if (!refreshed) {
    // Recarga completa a propósito: limpia todo el estado del cliente al perder la sesión,
    // igual que la redirección del proxy en el servidor.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/";
    throw await toApiError(response);
  }

  const retry = await fetch(path, { ...init, credentials: "include" });
  return parse<T>(retry);
}

/**
 * Cierra la sesión (S3-13): desconecta el socket antes del logout (docs/05-api.md)
 * y recarga a la portada aunque la petición falle.
 */
export async function logout(): Promise<void> {
  disconnectSocket();
  try {
    await apiFetchClient<void>("/api/auth/logout", { method: "POST" });
  } finally {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/";
  }
}
