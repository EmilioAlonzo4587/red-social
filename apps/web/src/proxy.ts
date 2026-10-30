import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PUBLIC_PATHS } from "@/lib/public-paths";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = (PUBLIC_PATHS as string[]).includes(pathname);
  const hasSession = request.cookies.has("access_token");

  if (!isPublic && !hasSession) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Con sesión activa no tiene sentido ver la portada, el login o el registro
  // de nuevo: lo mismo que la regla de arriba, pero al revés (S3-12).
  if (isPublic && hasSession) {
    return NextResponse.redirect(new URL("/feed", request.url));
  }

  const response = NextResponse.next();
  // Evita que el navegador sirva una página con datos de sesión desde su caché
  // (disco o back-forward) al volver con "atrás" después de cambiar de cuenta (S3-12).
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  // /api/* no pasa por aquí: la api tiene sus propias rutas públicas (@Public(), ej. /api/health,
  // /api/docs, /api/auth/login) y el resto exige sesión con su propio guard, no con este proxy.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
