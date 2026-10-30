import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-64px)] max-w-md flex-col items-center justify-center gap-8 px-4 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold">ChatInit</h1>
        <p className="text-muted">
          Publica, sigue, comenta y chatea en tiempo real.
        </p>
      </div>

      <div className="flex w-full flex-col gap-3">
        <Link
          href="/login"
          className="w-full rounded-md bg-primary px-4 py-2 font-medium text-white transition-colors hover:bg-primary-hover"
        >
          Iniciar sesión
        </Link>
        <Link
          href="/registro"
          className="w-full rounded-md border border-border px-4 py-2 font-medium text-foreground transition-colors hover:bg-surface"
        >
          Crear cuenta
        </Link>
      </div>
    </main>
  );
}
