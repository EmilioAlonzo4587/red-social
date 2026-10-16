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
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
