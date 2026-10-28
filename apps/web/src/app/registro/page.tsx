"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RegisterDto } from "@red/api-types";
import { apiFetchClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";
import { fieldErrorsFromDetails } from "@/lib/api-field-errors";

type FormErrors = {
  username?: string;
  email?: string;
  password?: string;
  general?: string;
};

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,30}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(username: string, email: string, password: string): FormErrors {
  const errors: FormErrors = {};

  if (!USERNAME_PATTERN.test(username)) {
    errors.username =
      "3 a 30 caracteres: solo letras, números y guion bajo.";
  }

  if (!EMAIL_PATTERN.test(email)) {
    errors.email = "Ingresa un correo válido.";
  }

  if (password.length < 8) {
    errors.password = "La contraseña debe tener al menos 8 caracteres.";
  }

  return errors;
}

export default function RegistroPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const clientErrors = validate(username, email, password);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      await apiFetchClient<unknown>("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          email,
          password,
        } satisfies RegisterDto),
      });
      router.push("/feed");
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.statusCode === 400 || error.statusCode === 409) {
          setErrors(fieldErrorsFromDetails(error.details));
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
      <h1 className="text-2xl font-bold">Crear cuenta</h1>

      {errors.general && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {errors.general}
        </p>
      )}

      <form method="post" noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="username" className="text-sm font-medium">
            Usuario
          </label>
          <input
            id="username"
            name="username"
            type="text"
            maxLength={30}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            aria-invalid={Boolean(errors.username)}
            className="rounded-md border border-border px-3 py-2 outline-primary aria-[invalid=true]:border-red-500"
            placeholder="ana_garcia"
          />
          <p className={`text-xs ${errors.username ? "text-red-600" : "text-muted"}`}>
            {errors.username ?? "3 a 30 caracteres: letras, números y guion bajo."}
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
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(errors.email)}
            className="rounded-md border border-border px-3 py-2 outline-primary aria-[invalid=true]:border-red-500"
            placeholder="ana@correo.com"
          />
          {errors.email && <p className="text-xs text-red-600">{errors.email}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(errors.password)}
            className="rounded-md border border-border px-3 py-2 outline-primary aria-[invalid=true]:border-red-500"
            placeholder="••••••••"
          />
          <p className={`text-xs ${errors.password ? "text-red-600" : "text-muted"}`}>
            {errors.password ?? "Al menos 8 caracteres."}
          </p>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-primary px-4 py-2 font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {submitting ? "Creando cuenta..." : "Crear cuenta"}
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
