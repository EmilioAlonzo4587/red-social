import Link from "next/link";
import type { MeDto } from "@red/api-types";
import { Avatar } from "@/components/avatar";

/**
 * Tarjeta de "estás en tu cuenta" en /feed (S3-19), en la columna derecha de
 * pantallas anchas. `me` viene de GET /api/auth/me, que /feed ya pide al montar.
 */
export function HomeProfileCard({
  me,
  loading,
}: {
  me: MeDto | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div
        aria-hidden="true"
        className="flex flex-col gap-3 rounded-lg border border-border p-4"
      >
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-surface" />
          <div className="flex flex-col gap-1.5">
            <div className="h-3.5 w-24 animate-pulse rounded bg-surface" />
            <div className="h-3 w-20 animate-pulse rounded bg-surface" />
          </div>
        </div>
        <div className="h-3 w-full animate-pulse rounded bg-surface" />
        <div className="h-8 w-28 animate-pulse rounded-md bg-surface" />
      </div>
    );
  }

  // GET /api/auth/me falló: la columna no se muestra, el feed sigue funcionando.
  if (!me) return null;

  const displayName = me.displayName ?? me.username;

  return (
    <div className="home-profile-card flex flex-col gap-3 rounded-lg border border-border p-4">
      <Link href={`/u/${me.username}`} className="flex items-center gap-3">
        <Avatar
          name={displayName}
          avatarPublicId={me.avatarPublicId}
          size="md"
        />
        <div className="flex flex-col">
          <span className="text-sm font-semibold">{displayName}</span>
          <span className="text-xs text-muted">@{me.username}</span>
        </div>
      </Link>

      {me.bio ? (
        <p className="whitespace-pre-line text-sm">{me.bio}</p>
      ) : (
        <Link
          href="/perfil/editar"
          className="text-sm text-primary hover:underline"
        >
          Agregar una biografía
        </Link>
      )}

      <Link
        href="/perfil/editar"
        className="self-start rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface"
      >
        Editar perfil
      </Link>
    </div>
  );
}
