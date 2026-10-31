import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetchClient } from "./api-client";
import { ApiError } from "./api-error";

vi.mock("./socket", () => ({ disconnectSocket: vi.fn() }));

function unauthorized(): Response {
  return new Response(
    JSON.stringify({ statusCode: 401, message: "Credenciales inválidas" }),
    { status: 401, headers: { "Content-Type": "application/json" } },
  );
}

describe("apiFetchClient", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: (_name: string, callback: () => Promise<boolean>) =>
          callback(),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(["/api/auth/login", "/api/auth/register"])(
    "un 401 en %s se devuelve como error sin intentar refrescar (no recarga la página)",
    async (path) => {
      fetchMock.mockResolvedValueOnce(unauthorized());

      const error = await apiFetchClient(path, { method: "POST" }).catch(
        (e: unknown) => e,
      );

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(401);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).not.toHaveBeenCalledWith(
        "/api/auth/refresh",
        expect.anything(),
      );
    },
  );

  it("un 401 en cualquier otra ruta intenta refrescar y reintenta", async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await expect(apiFetchClient("/api/feed")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/auth/refresh",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
