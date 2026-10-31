import Link from "next/link";
import { BrandLayout } from "@/components/brand-layout";

export default function Home() {
  return (
    <BrandLayout mobileHero="tall">
      <main className="flex w-full max-w-md flex-col items-center gap-8 text-center">
        <div className="flex flex-col gap-2">
          {/* En el celular la marca ya va en la franja verde de arriba (S4-06) */}
          <h1 className="text-2xl font-bold lg:text-4xl">
            <span className="lg:hidden">Te damos la bienvenida</span>
            <span className="hidden lg:inline">ChatInit</span>
          </h1>
          <p className="text-sm text-muted lg:text-base">
            Publica, sigue, comenta y chatea en tiempo real.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3">
          <Link
            href="/login"
            className="w-full rounded-lg bg-action px-4 py-3 font-semibold lg:py-2 lg:font-medium text-white transition-colors hover:bg-action-hover"
          >
            Iniciar sesión
          </Link>
          <Link
            href="/registro"
            className="w-full rounded-lg border border-border px-4 py-3 font-semibold lg:py-2 lg:font-medium text-foreground transition-colors hover:bg-surface"
          >
            Crear cuenta
          </Link>
        </div>
      </main>
    </BrandLayout>
  );
}
