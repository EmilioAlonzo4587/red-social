import Link from "next/link";

/**
 * Burbuja de chat blanca: el mismo motivo del favicon (S3-17, `app/icon.tsx`),
 * a mayor escala.
 */
function BrandBubble() {
  return (
    <div className="brand-bubble flex h-24 w-24 items-center justify-center rounded-[22px] bg-white/15">
      <div className="relative flex h-[38px] w-[52px] rounded-[11px] bg-white">
        <div className="absolute -bottom-[11px] left-3 h-0 w-0 border-x-[11px] border-t-[14px] border-x-transparent border-t-white" />
      </div>
    </div>
  );
}

/**
 * Panel verde de la izquierda (S4-08). Todo lo que no es la frase de marca es
 * decorativo (aria-hidden): las tarjetas imitan datos de la app, no son reales.
 */
function BrandPanel() {
  return (
    <div className="relative hidden grow basis-[520px] flex-col justify-center overflow-hidden bg-primary p-[72px] lg:flex">
      <div aria-hidden="true">
        <div className="brand-dots absolute -inset-[30px] opacity-55" />

        <div className="brand-blob-a pointer-events-none absolute -left-[70px] -top-[70px] h-[280px] w-[280px] rounded-full bg-primary-hover blur-[44px]" />
        <div className="brand-blob-b pointer-events-none absolute -bottom-[90px] -right-[50px] h-[240px] w-[240px] rounded-full bg-green-300 opacity-35 blur-[44px]" />
        <div className="brand-blob-c pointer-events-none absolute bottom-[60px] left-[42%] h-[180px] w-[180px] rounded-full bg-primary-hover opacity-40 blur-[44px]" />
        <div className="brand-blob-d pointer-events-none absolute right-[18%] top-[20%] h-[200px] w-[200px] rounded-full bg-green-400 opacity-30 blur-[44px]" />
        <div className="brand-blob-e pointer-events-none absolute left-[8%] top-[55%] h-[150px] w-[150px] rounded-full bg-green-200 opacity-25 blur-[44px]" />
      </div>

      <Link
        href="/"
        aria-label="ChatInit, ir a la portada"
        className="relative mb-10 self-start rounded-[22px] outline-white"
      >
        <BrandBubble />
      </Link>

      <p className="relative mb-5 max-w-[480px] text-[44px] font-extrabold leading-[1.15] text-white">
        Conecta, comparte y chatea al instante.
      </p>
      <p className="relative max-w-[420px] text-lg leading-normal text-white/85">
        Publica, sigue, comenta y chatea en tiempo real con las personas que te
        importan.
      </p>

      <div
        aria-hidden="true"
        className="brand-card-a absolute right-[88px] top-24 flex w-[236px] items-center gap-2.5 rounded-xl bg-white px-4 py-3.5 shadow-[0_10px_30px_rgba(0,0,0,0.18)]"
      >
        <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
          AL
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] font-semibold text-foreground">
            Ana López
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap text-xs text-muted">
            <svg
              viewBox="0 0 24 24"
              className="h-3 w-3 shrink-0 fill-red-600"
            >
              <path d="M12 21s-7.2-4.6-10-9.2C.4 8.6 2 5 5.6 5c2 0 3.4 1 4.4 2.4C11 6 12.4 5 14.4 5 18 5 19.6 8.6 18 11.8 15.2 16.4 12 21 12 21z" />
            </svg>
            le gustó tu publicación
          </span>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="brand-card-b absolute bottom-[110px] left-24 flex w-[210px] items-center gap-2.5 rounded-xl bg-white px-4 py-3.5 shadow-[0_10px_30px_rgba(0,0,0,0.18)]"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          strokeWidth={1.6}
          className="h-[22px] w-[22px] shrink-0 stroke-primary"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-2.76.227-5.55.227-8.31 0a1.966 1.966 0 01-.825-.242M20.25 8.511V6.637c0-1.621-1.152-3.026-2.76-3.235a48.455 48.455 0 00-11.98 0C3.902 3.611 2.75 5.016 2.75 6.637v6.226c0 1.621 1.152 3.026 2.76 3.235a46.6 46.6 0 004.5.312"
          />
        </svg>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] font-semibold text-foreground">
            Carlos
          </span>
          <span className="text-xs text-muted">Nuevo mensaje</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Portada, login y registro (S4-08): desde `lg` (1024px), panel de marca a la
 * izquierda y el contenido de la página a la derecha, de pared a pared. Más
 * angosto, el panel se oculta y queda solo el contenido; como el Navbar tampoco
 * se muestra en estas rutas, `showMobileBrand` deja un enlace a la portada arriba
 * (la portada lo apaga: su propio título ya es la marca).
 */
export function BrandLayout({
  children,
  showMobileBrand = true,
}: {
  children: React.ReactNode;
  showMobileBrand?: boolean;
}) {
  return (
    <div className="flex min-h-screen">
      <BrandPanel />

      <div className="flex grow basis-[420px] flex-col items-center justify-center gap-8 px-6 py-12">
        {showMobileBrand && (
          <Link
            href="/"
            className="text-xl font-bold text-primary lg:hidden"
          >
            ChatInit
          </Link>
        )}
        {children}
      </div>
    </div>
  );
}
