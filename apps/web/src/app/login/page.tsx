import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-56px)] max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-bold">Iniciar sesión</h1>

      <form className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="identifier" className="text-sm font-medium">
            Usuario o correo
          </label>
          <input
            id="identifier"
            name="identifier"
            type="text"
            className="rounded-md border border-black/20 px-3 py-2"
            placeholder="ana_garcia"
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
            className="rounded-md border border-black/20 px-3 py-2"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-black px-4 py-2 font-medium text-white"
        >
          Iniciar sesión
        </button>
      </form>

      <p className="text-center text-sm text-black/60">
        ¿No tienes cuenta?{" "}
        <Link href="/registro" className="font-medium text-black underline">
          Regístrate
        </Link>
      </p>
    </main>
  );
}
