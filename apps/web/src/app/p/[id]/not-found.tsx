import Link from "next/link";

export default function PostNotFound() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-64px)] max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-bold">Publicación no encontrada</h1>
      <p className="text-sm text-muted">
        No existe esta publicación, o fue eliminada.
      </p>
      <Link
        href="/feed"
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
      >
        Volver al feed
      </Link>
    </main>
  );
}
