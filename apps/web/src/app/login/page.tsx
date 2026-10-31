"use client";

import { useState } from "react";
import Link from "next/link";
import type { LoginDto } from "@red/api-types";
import { apiFetchClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";
import { fieldErrorsFromDetails } from "@/lib/api-field-errors";
import { PasswordInput } from "@/components/password-input";
import { BrandLayout } from "@/components/brand-layout";

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
      // Navegación completa que reemplaza la entrada (no router.replace: la caché
      // del router de Next puede resolver "atrás" sin pasar por proxy.ts) (S3-12).
      window.location.replace("/feed");
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
    <BrandLayout>
      <main className="flex w-full max-w-[380px] flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[26px] font-bold lg:text-[28px]">Iniciar sesión</h1>
          <p className="text-sm text-muted">Entra para ver tu feed y tus mensajes.</p>
        </div>

        {errors.general && (
          <p className="rounded-xl bg-danger-surface px-3 py-2 text-sm text-danger">
            {errors.general}
          </p>
        )}

        <form method="post" noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="identifier" className="text-sm font-medium">
              Usuario o correo
            </label>
            {/* Ícono de usuario dentro del campo, en el mismo trazo que los de la
                barra lateral; se pone verde al escribir (S4-06). Sin texto de ejemplo. */}
            <div className="group relative">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted group-focus-within:text-primary"
              >
                <path d="M8 8a4 4 0 1 0 8 0a4 4 0 1 0-8 0M4 21a8 8 0 0 1 16 0" />
              </svg>
              <input
                id="identifier"
                name="identifier"
                type="text"
                autoComplete="username"
                maxLength={254}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                aria-invalid={Boolean(errors.identifier)}
                className="w-full rounded-lg border border-border py-2 pl-10 pr-3 outline-primary aria-[invalid=true]:border-danger"
              />
            </div>
            {errors.identifier && (
              <p className="text-xs text-danger">{errors.identifier}</p>
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
              leadingIcon
            />
            {errors.password && (
              <p className="text-xs text-danger">{errors.password}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-action px-4 py-3 font-semibold lg:py-2 lg:font-medium text-white transition-colors hover:bg-action-hover disabled:opacity-60"
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
    </BrandLayout>
  );
}
