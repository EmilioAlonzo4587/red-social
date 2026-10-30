import Link from "next/link";
import type { MeDto, ProfileDto } from "@red/api-types";
import { Avatar } from "@/components/avatar";

/**
 * Tarjeta de "tu perfil" en la columna derecha de /feed (S4-09, siguiendo el
 * mockup de referencia al detalle): foto, nombre, biografía, seguidores/seguidos
 * y acceso a editar perfil. `me` viene de GET /api/auth/me; `profile`, de
 * GET /api/users/{username} (es el único dato, seguidores/seguidos, que no
 * trae /api/auth/me).
 */
export function HomeProfileCard({
  me,
  profile,
  loading,
}: {
  me: MeDto | null;
  profile: ProfileDto | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div aria-hidden="true" className="flex flex-col gap-2">
        <div className="h-2.5 w-16 animate-pulse rounded bg-surface" />
        <div className="flex flex-col gap-2.5 rounded-xl border border-border p-4">
          <div className="h-14 w-14 animate-pulse rounded-full bg-surface" />
          <div className="flex flex-col gap-1.5">
            <div className="h-3.5 w-24 animate-pulse rounded bg-surface" />
            <div className="h-3 w-20 animate-pulse rounded bg-surface" />
          </div>
          <div className="h-3 w-full animate-pulse rounded bg-surface" />
          <div className="h-3 w-32 animate-pulse rounded bg-surface" />
          <div className="h-8 w-28 animate-pulse rounded-lg bg-surface" />
        </div>
      </div>
    );
  }

  // GET /api/auth/me falló: la columna no se muestra, el feed sigue funcionando.
  if (!me) return null;

  const displayName = me.displayName ?? me.username;

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[11px] uppercase tracking-[0.08em] text-muted">
        Tu perfil
      </span>

      <div className="flex flex-col items-start gap-2.5 rounded-xl border border-border p-4">
        <Link
          href={`/u/${me.username}`}
          className="flex flex-col items-start gap-2.5"
        >
          <Avatar
            name={displayName}
            avatarPublicId={me.avatarPublicId}
            size="lg"
          />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold hover:underline">
              {displayName}
            </span>
            <span className="truncate text-xs text-muted">
              @{me.username}
            </span>
          </div>
        </Link>

        {me.bio ? (
          <p className="whitespace-pre-line text-[15px] leading-[1.55] [overflow-wrap:anywhere]">
            {me.bio}
          </p>
        ) : (
          <Link
            href="/perfil/editar"
            className="text-sm text-primary hover:underline"
          >
            Agregar una biografía
          </Link>
        )}

        {profile && (
          <div className="flex gap-3.5 text-xs text-muted tabular-nums">
            <span>
              <b className="font-semibold text-foreground">
                {profile.followerCount}
              </b>{" "}
              seguidores
            </span>
            <span>
              <b className="font-semibold text-foreground">
                {profile.followingCount}
              </b>{" "}
              seguidos
            </span>
          </div>
        )}

        <Link
          href="/perfil/editar"
          className="rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-surface"
        >
          Editar perfil
        </Link>
      </div>
    </div>
  );
}
