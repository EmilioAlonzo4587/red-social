"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserSearch } from "@/components/user-search";
import { PUBLIC_PATHS } from "@/lib/public-paths";

export function Navbar() {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.includes(pathname);

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface">
      <nav className="flex h-14 items-center gap-4 px-4">
        <Link
          href={isPublic ? "/" : "/feed"}
          className="shrink-0 text-lg font-bold text-primary"
        >
          ChatInit
        </Link>

        {!isPublic && <UserSearch />}
      </nav>
    </header>
  );
}
