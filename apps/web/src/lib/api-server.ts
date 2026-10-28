import "server-only";
import { cookies } from "next/headers";
import { toApiError } from "./api-error";

const API_INTERNAL_URL = process.env.API_INTERNAL_URL;

/**
 * Llama a la api desde un Server Component reenviando la cookie de sesión del usuario (RNF02).
 * `path` empieza con "/api/...".
 */
export async function apiFetchServer<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const cookieStore = await cookies();

  const response = await fetch(`${API_INTERNAL_URL}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Cookie: cookieStore.toString(),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
