import Link from "next/link";
import { BrandLayout } from "@/components/brand-layout";

export default function Home() {
  return (
    <BrandLayout showMobileBrand={false}>
      <main className="flex w-full max-w-md flex-col items-center gap-8 text-center">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold">ChatInit</h1>
          <p className="text-muted">
            Publica, sigue, comenta y chatea en tiempo real.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3">
          <Link
            href="/login"
            className="w-full rounded-lg bg-primary px-4 py-2 font-medium text-white transition-colors hover:bg-primary-hover"
          >
            Iniciar sesión
          </Link>
          <Link
            href="/registro"
            className="w-full rounded-lg border border-border px-4 py-2 font-medium text-foreground transition-colors hover:bg-surface"
          >
            Crear cuenta
          </Link>
        </div>
      </main>
    </BrandLayout>
  );
}
