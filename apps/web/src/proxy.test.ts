import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

function request(pathname: string, hasSession: boolean): NextRequest {
  const headers = new Headers();
  if (hasSession) headers.set("cookie", "access_token=abc123");
  return new NextRequest(`http://localhost:3001${pathname}`, { headers });
}

describe("proxy", () => {
  it("sin sesión, una ruta privada redirige a la portada", () => {
    const response = proxy(request("/feed", false));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3001/");
  });

  it("sin sesión, una ruta pública deja pasar", () => {
    const response = proxy(request("/login", false));
    expect(response.headers.get("location")).toBeNull();
  });

  it("con sesión, la portada redirige al feed", () => {
    const response = proxy(request("/", true));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3001/feed",
    );
  });

  it("con sesión, login redirige al feed", () => {
    const response = proxy(request("/login", true));
    expect(response.headers.get("location")).toBe(
      "http://localhost:3001/feed",
    );
  });

  it("con sesión, registro redirige al feed", () => {
    const response = proxy(request("/registro", true));
    expect(response.headers.get("location")).toBe(
      "http://localhost:3001/feed",
    );
  });

  it("con sesión, una ruta privada deja pasar sin caché", () => {
    const response = proxy(request("/feed", true));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("Ajustes exige sesión (S4-13)", () => {
    const sinSesion = proxy(request("/ajustes", false));
    expect(sinSesion.status).toBe(307);
    expect(sinSesion.headers.get("location")).toBe("http://localhost:3001/");

    const conSesion = proxy(request("/ajustes", true));
    expect(conSesion.headers.get("location")).toBeNull();
  });
});
