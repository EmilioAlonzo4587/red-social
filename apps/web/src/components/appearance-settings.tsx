"use client";

import { useRef, useState } from "react";
import {
  applyThemePreference,
  type ThemePreference,
} from "@/lib/theme";

const OPTIONS: {
  value: ThemePreference;
  label: string;
  description?: string;
}[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
  { value: "system", label: "Automático", description: "Igual que tu dispositivo" },
];

/**
 * Miniatura de cada tema (mockup S4-13, opción C). Usa los colores fijos de cada
 * paleta, no los tokens: tiene que verse igual sea cual sea el tema activo.
 */
function ThemePreview({ value }: { value: ThemePreference }) {
  if (value === "system") {
    return (
      <span
        aria-hidden="true"
        className="grid h-[72px] grid-cols-2 overflow-hidden rounded-lg border border-border"
      >
        <span className="bg-[#ffffff]" />
        <span className="bg-[#0f1512]" />
      </span>
    );
  }
  const dark = value === "dark";
  return (
    <span
      aria-hidden="true"
      className={`flex h-[72px] flex-col gap-1.5 rounded-lg border p-2.5 ${
        dark ? "border-[#26342c] bg-[#0f1512]" : "border-[#d8ebdf] bg-[#ffffff]"
      }`}
    >
      <span
        className={`h-2 w-3/5 rounded ${dark ? "bg-[#4ade80]" : "bg-[#16a34a]"}`}
      />
      <span
        className={`h-1.5 w-11/12 rounded ${dark ? "bg-[#26342c]" : "bg-[#d8ebdf]"}`}
      />
      <span
        className={`h-1.5 w-3/4 rounded ${dark ? "bg-[#26342c]" : "bg-[#d8ebdf]"}`}
      />
    </span>
  );
}

/**
 * Sección "Apariencia" de /ajustes (S4-13): Claro, Oscuro o Automático. Es un grupo de
 * radios accesible: Tab entra a la opción elegida y las flechas (o Inicio/Fin) cambian
 * de opción, como los radios nativos. Elegir una aplica el tema al instante en toda la
 * app y lo guarda en la cookie (applyThemePreference).
 */
export function AppearanceSettings({
  initialPreference,
}: {
  initialPreference: ThemePreference;
}) {
  const [selected, setSelected] = useState(initialPreference);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function choose(preference: ThemePreference) {
    setSelected(preference);
    applyThemePreference(preference);
  }

  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    const last = OPTIONS.length - 1;
    const next = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowDown: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      ArrowUp: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    choose(OPTIONS[next].value);
    optionRefs.current[next]?.focus();
  }

  const selectedLabel = OPTIONS.find((option) => option.value === selected)?.label;

  return (
    <section
      aria-labelledby="appearance-title"
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id="appearance-title" className="text-base font-bold">
          Apariencia
        </h2>
        <p className="text-sm text-muted">
          Elige cómo se ve ChatInit en este dispositivo.
        </p>
      </div>

      <div
        role="radiogroup"
        aria-labelledby="appearance-title"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {OPTIONS.map((option, index) => {
          const checked = option.value === selected;
          return (
            <button
              key={option.value}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => choose(option.value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={`flex flex-col gap-2.5 rounded-xl bg-background p-2.5 text-left ${
                checked
                  ? "border-2 border-primary"
                  : "border border-border hover:border-primary"
              }`}
            >
              <ThemePreview value={option.value} />
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <span className="flex flex-col">
                  {option.label}
                  {option.description && (
                    <span className="text-xs font-normal text-muted">
                      {option.description}
                    </span>
                  )}
                </span>
                {checked && (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="ml-auto h-4 w-4 shrink-0 text-primary"
                  >
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Anuncia el cambio a quien usa lector de pantalla */}
      <p role="status" className="sr-only">
        Tema: {selectedLabel}
      </p>
    </section>
  );
}
