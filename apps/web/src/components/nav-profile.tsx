import Link from "next/link";
import type { MeDto } from "@red/api-types";
import { Avatar } from "@/components/avatar";

/**
 * "Estás en tu cuenta" (S3-19), en la esquina superior derecha del Navbar, a la
 * misma altura que "ChatInit" y el buscador. `me` lo pide el propio Navbar con
 * GET /api/auth/me, igual que ya hace Sidebar para "Mi perfil".
 */
export function NavProfile({
  me,
  loading,
}: {
  me: MeDto | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div aria-hidden="true" className="ml-auto flex shrink-0 items-center gap-2">
        <div className="h-11 w-11 animate-pulse rounded-full bg-border" />
        <div className="hidden flex-col gap-1 sm:flex">
          <div className="h-3.5 w-24 animate-pulse rounded bg-border" />
          <div className="h-3 w-20 animate-pulse rounded bg-border" />
        </div>
      </div>
    );
  }

  // GET /api/auth/me falló: no se muestra nada, el resto del Navbar sigue funcionando.
  if (!me) return null;

  const displayName = me.displayName ?? me.username;

  return (
    <Link
      href={`/u/${me.username}`}
      className="nav-profile ml-auto flex shrink-0 items-center gap-2 rounded-md p-1 hover:bg-background"
    >
      <Avatar name={displayName} avatarPublicId={me.avatarPublicId} size="md" />
      <div className="hidden min-w-0 flex-col sm:flex">
        <span className="truncate text-base font-semibold leading-tight">
          {displayName}
        </span>
        <span className="truncate text-sm leading-tight text-muted">
          @{me.username}
        </span>
      </div>
    </Link>
  );
}
