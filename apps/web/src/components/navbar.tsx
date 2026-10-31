"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { UserSearch } from "@/components/user-search";
import { PUBLIC_PATHS } from "@/lib/public-paths";

export function Navbar() {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.includes(pathname);

  // S4-08: portada, login y registro no llevan barra; su marca está en BrandLayout.
  if (isPublic) return null;

  // S4-09, como el mockup: marca a la izquierda y buscador a la derecha. La cuenta
  // activa ya no va aquí (era NavProfile, S3-19): está en la tarjeta "Tu perfil" de /feed.
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background">
      <nav className="flex h-16 items-center gap-2 px-4 sm:gap-4 sm:px-5">
        <Link
          href="/feed"
          className="flex shrink-0 items-center gap-2 text-xl font-bold text-primary"
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="shrink-0"
          >
            <rect width="24" height="24" rx="6" className="fill-primary" />
            <path
              d="M6 8.5A2.5 2.5 0 0 1 8.5 6h7A2.5 2.5 0 0 1 18 8.5v4a2.5 2.5 0 0 1-2.5 2.5H11l-3 3v-3h0.5A2.5 2.5 0 0 1 6 12.5z"
              fill="#fff"
            />
          </svg>
          ChatInit
        </Link>

        <UserSearch />
        <LogoutButton variant="icon" />
      </nav>
    </header>
  );
}
