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

  return NextResponse.next();
}

export const config = {
  // /api/* no pasa por aquí: la api tiene sus propias rutas públicas (@Public(), ej. /api/health,
  // /api/docs, /api/auth/login) y el resto exige sesión con su propio guard, no con este proxy.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
