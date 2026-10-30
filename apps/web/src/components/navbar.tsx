"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { MeDto } from "@red/api-types";
import { NavProfile } from "@/components/nav-profile";
import { UserSearch } from "@/components/user-search";
import { apiFetchClient } from "@/lib/api-client";
import { PUBLIC_PATHS } from "@/lib/public-paths";

export function Navbar() {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.includes(pathname);
  const [me, setMe] = useState<MeDto | null>(null);
  const [meLoading, setMeLoading] = useState(true);

  // S3-19: para la tarjeta "estás en tu cuenta" de la esquina superior derecha.
  useEffect(() => {
    if (isPublic) return;
    apiFetchClient<MeDto>("/api/auth/me")
      .then((result) => setMe(result))
      .catch(() => {})
      .finally(() => setMeLoading(false));
  }, [isPublic]);

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface">
      <nav className="flex h-16 items-center gap-4 px-4">
        <Link
          href={isPublic ? "/" : "/feed"}
          className="shrink-0 text-xl font-bold text-primary"
        >
          ChatInit
        </Link>

        {!isPublic && <UserSearch />}
        {!isPublic && <NavProfile me={me} loading={meLoading} />}
      </nav>
    </header>
  );
}
