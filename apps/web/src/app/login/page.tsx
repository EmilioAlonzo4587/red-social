"use client";

import { useState } from "react";
import Link from "next/link";

type FormErrors = {
  identifier?: string;
  password?: string;
};

function validate(identifier: string, password: string): FormErrors {
  const errors: FormErrors = {};

  if (!identifier.trim()) {
    errors.identifier = "Ingresa tu usuario o correo.";
  }

  if (!password) {
    errors.password = "Ingresa tu contraseña.";
  }

  return errors;
}

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors(validate(identifier, password));
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-56px)] max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-bold">Iniciar sesión</h1>

      <form method="post" noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="identifier" className="text-sm font-medium">
            Usuario o correo
          </label>
          <input
            id="identifier"
            name="identifier"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            aria-invalid={Boolean(errors.identifier)}
            className="rounded-md border border-border px-3 py-2 outline-primary aria-[invalid=true]:border-red-500"
            placeholder="ana_garcia"
          />
          {errors.identifier && (
            <p className="text-xs text-red-600">{errors.identifier}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(errors.password)}
            className="rounded-md border border-border px-3 py-2 outline-primary aria-[invalid=true]:border-red-500"
            placeholder="••••••••"
          />
          {errors.password && (
            <p className="text-xs text-red-600">{errors.password}</p>
          )}
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-primary px-4 py-2 font-medium text-white transition-colors hover:bg-primary-hover"
        >
          Iniciar sesión
        </button>
      </form>

      <p className="text-center text-sm text-muted">
        ¿No tienes cuenta?{" "}
        <Link href="/registro" className="font-medium text-primary underline">
          Regístrate
        </Link>
      </p>
    </main>
  );
}
