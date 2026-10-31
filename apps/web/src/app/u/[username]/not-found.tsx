import Link from "next/link";

export default function ProfileNotFound() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-64px)] max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-bold">Usuario no encontrado</h1>
      <p className="text-sm text-muted">
        No existe ninguna cuenta con ese nombre de usuario.
      </p>
      <Link
        href="/feed"
        className="rounded-lg bg-action px-4 py-2 text-sm font-medium text-white hover:bg-action-hover"
      >
        Volver al feed
      </Link>
    </main>
  );
}
