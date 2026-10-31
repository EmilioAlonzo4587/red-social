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

const LIKE_PATH =
  "M12 21s-7.2-4.6-10-9.2C.4 8.6 2 5 5.6 5c2 0 3.4 1 4.4 2.4C11 6 12.4 5 14.4 5 18 5 19.6 8.6 18 11.8 15.2 16.4 12 21 12 21z";
const MESSAGE_PATH = "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z";

/** Tarjetas chicas e inclinadas de la franja del celular (decorativas). */
function MiniLikeCard({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`brand-mini-card absolute flex w-[178px] items-center gap-2 rounded-xl bg-white px-[11px] py-[9px] shadow-[0_10px_24px_rgba(0,0,0,0.18)] ${className}`}
    >
      <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
        AL
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="text-[11px] font-semibold text-foreground">
          Ana López
        </span>
        <span className="flex items-center gap-[3px] whitespace-nowrap text-[10px] text-muted">
          <svg viewBox="0 0 24 24" className="h-[9px] w-[9px] shrink-0 fill-red-600">
            <path d={LIKE_PATH} />
          </svg>
          le gustó tu publicación
        </span>
      </div>
    </div>
  );
}

function MiniMessageCard({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`brand-mini-card absolute flex w-[150px] items-center gap-2 rounded-xl bg-white px-[11px] py-[9px] shadow-[0_10px_24px_rgba(0,0,0,0.18)] ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[18px] w-[18px] shrink-0 stroke-primary"
      >
        <path d={MESSAGE_PATH} />
      </svg>
      <div className="flex min-w-0 flex-col">
        <span className="text-[11px] font-semibold text-foreground">Carlos</span>
        <span className="text-[10px] text-muted">Nuevo mensaje</span>
      </div>
    </div>
  );
}

type MobileHeroSize = "compact" | "medium" | "tall";

// Alto de la franja y tamaño de la frase según cuánto contenido va debajo:
// registro tiene tres campos (compacta), login dos (mediana) y la portada solo
// dos botones (alta, con las dos tarjetas).
const HERO_STYLES: Record<
  MobileHeroSize,
  { box: string; phrase: string; subtitle: boolean }
> = {
  compact: {
    box: "h-[236px] pt-8",
    phrase: "mt-7 max-w-[300px] text-[26px] leading-[1.15]",
    subtitle: false,
  },
  medium: {
    box: "h-[300px] pt-10",
    phrase: "mb-2 mt-10 max-w-[300px] text-[28px] leading-[1.15]",
    subtitle: true,
  },
  tall: {
    box: "h-[520px] max-h-[62dvh] min-h-[400px] pt-12",
    phrase: "mb-3 mt-20 text-[30px] leading-[1.12]",
    subtitle: true,
  },
};

/**
 * Franja verde de marca para el celular (S4-06): la versión compacta del panel
 * de la izquierda, que bajo `lg` se oculta. Antes en el celular solo quedaba el
 * formulario sobre blanco.
 */
function MobileHero({ size }: { size: MobileHeroSize }) {
  const style = HERO_STYLES[size];
  return (
    <div
      className={`relative shrink-0 overflow-hidden px-6 lg:hidden ${style.box}`}
    >
      <div aria-hidden="true">
        <div className="brand-dots absolute -inset-[30px] opacity-55" />
        <div className="brand-blob-a pointer-events-none absolute -left-[50px] -top-[60px] h-[200px] w-[200px] rounded-full bg-primary-hover blur-[36px]" />
        <div className="brand-blob-b pointer-events-none absolute -right-[50px] top-[40%] h-[170px] w-[170px] rounded-full bg-green-300 opacity-35 blur-[36px]" />
        <div className="brand-blob-c pointer-events-none absolute left-[40%] top-[20%] h-[140px] w-[140px] rounded-full bg-green-400 opacity-30 blur-[36px]" />
      </div>

      <Link
        href="/"
        aria-label="ChatInit, ir a la portada"
        className="relative inline-flex items-center gap-2.5 rounded-2xl outline-white"
      >
        <span className="brand-bubble flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
          <span className="relative flex h-[22px] w-[30px] rounded-[7px] bg-white">
            <span className="absolute -bottom-[7px] left-[7px] h-0 w-0 border-x-[7px] border-t-[9px] border-x-transparent border-t-white" />
          </span>
        </span>
        <span className="text-[22px] font-extrabold tracking-[-0.01em] text-white">
          ChatInit
        </span>
      </Link>

      {size === "compact" ? (
        <MiniMessageCard className="right-5 top-9" />
      ) : (
        <MiniLikeCard className="right-3 top-11" />
      )}
      {size === "tall" && (
        <MiniMessageCard className="bottom-11 left-6 [animation-delay:-3s]" />
      )}

      <p
        className={`relative font-extrabold text-white ${style.phrase}`}
      >
        Conecta, comparte y chatea al instante.
      </p>
      {style.subtitle && (
        <p
          className={`relative max-w-[300px] leading-[1.45] text-white/85 ${
            size === "tall" ? "text-base" : "text-sm"
          }`}
        >
          Publica, sigue y chatea en tiempo real con las personas que te
          importan.
        </p>
      )}
    </div>
  );
}

/**
 * Portada, login y registro (S4-08): desde `lg` (1024px), panel de marca a la
 * izquierda y el contenido de la página a la derecha, de pared a pared. Más
 * angosto (S4-06), una franja verde de marca arriba (`mobileHero` define su alto)
 * y el contenido en una tarjeta blanca con las esquinas de arriba redondeadas,
 * montada sobre la franja. La franja también enlaza a la portada, porque el
 * Navbar no se muestra en estas rutas.
 */
export function BrandLayout({
  children,
  mobileHero = "medium",
}: {
  children: React.ReactNode;
  mobileHero?: MobileHeroSize;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-primary lg:min-h-screen lg:flex-row lg:bg-background">
      <BrandPanel />
      <MobileHero size={mobileHero} />

      <div className="relative -mt-2 flex flex-1 flex-col items-center gap-8 rounded-t-[28px] bg-background px-6 pb-8 pt-7 shadow-[0_-8px_24px_rgba(15,26,20,0.10)] lg:mt-0 lg:grow lg:basis-[420px] lg:justify-center lg:rounded-none lg:py-12 lg:shadow-none">
        {children}
      </div>
    </div>
  );
}
