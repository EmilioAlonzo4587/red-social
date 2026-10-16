import Link from "next/link";

export default function RegistroPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-56px)] max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-bold">Crear cuenta</h1>

      <form method="post" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="username" className="text-sm font-medium">
            Usuario
          </label>
          <input
            id="username"
            name="username"
            type="text"
            className="rounded-md border border-border px-3 py-2 outline-primary"
            placeholder="ana_garcia"
          />
          <p className="text-xs text-muted">
            3 a 30 caracteres: letras, números y guion bajo.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-sm font-medium">
            Correo
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className="rounded-md border border-border px-3 py-2 outline-primary"
            placeholder="ana@correo.com"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className="rounded-md border border-border px-3 py-2 outline-primary"
            placeholder="••••••••"
          />
          <p className="text-xs text-muted">Al menos 8 caracteres.</p>
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-primary px-4 py-2 font-medium text-white transition-colors hover:bg-primary-hover"
        >
          Crear cuenta
        </button>
      </form>

      <p className="text-center text-sm text-muted">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium text-primary underline">
          Inicia sesión
        </Link>
      </p>
    </main>
  );
}
