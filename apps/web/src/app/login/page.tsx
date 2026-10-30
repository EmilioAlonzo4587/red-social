"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LoginDto } from "@red/api-types";
import { apiFetchClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";
import { fieldErrorsFromDetails } from "@/lib/api-field-errors";
import { PasswordInput } from "@/components/password-input";

type FormErrors = {
  identifier?: string;
  password?: string;
  general?: string;
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
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const clientErrors = validate(identifier, password);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      await apiFetchClient<unknown>("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password } satisfies LoginDto),
      });
      // replace, no push: que "atrás" no regrese al formulario de login (S3-12).
      router.replace("/feed");
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.statusCode === 400) {
          setErrors(fieldErrorsFromDetails(error.details));
        } else if (error.statusCode === 401) {
          setErrors({ general: "Usuario o contraseña incorrectos." });
        } else if (error.statusCode === 429) {
          setErrors({ general: "Demasiados intentos. Espera un momento." });
        } else {
          setErrors({ general: error.message });
        }
      } else {
        setErrors({ general: "No se pudo conectar con el servidor." });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-56px)] max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-bold">Iniciar sesión</h1>

      {errors.general && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {errors.general}
        </p>
      )}

      <form method="post" noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="identifier" className="text-sm font-medium">
            Usuario o correo
          </label>
          <input
            id="identifier"
            name="identifier"
            type="text"
            maxLength={254}
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
          <PasswordInput
            id="password"
            name="password"
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            ariaInvalid={Boolean(errors.password)}
            placeholder="••••••••"
          />
          {errors.password && (
            <p className="text-xs text-red-600">{errors.password}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-primary px-4 py-2 font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {submitting ? "Iniciando sesión..." : "Iniciar sesión"}
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
