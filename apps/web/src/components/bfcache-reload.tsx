"use client";

import { useEffect } from "react";

// event.persisted es poco confiable en algunos navegadores (puede dar true en una
// carga normal, no solo al restaurar desde bfcache) — confirmar con el tipo de
// navegación real evita recargar de más, y un posible bucle si un navegador
// reporta persisted=true otra vez justo después de la propia recarga.
function isBackForwardNavigation(): boolean {
  if (typeof performance === "undefined") return false;
  const [entry] = performance.getEntriesByType(
    "navigation",
  ) as PerformanceNavigationTiming[];
  return entry?.type === "back_forward";
}

// Si el navegador restaura la página desde su back-forward cache en vez de pedirla
// de nuevo, no pasa por el proxy ni por ninguna petición a la api: se queda con los
// datos ya pintados, aunque la sesión haya cambiado de cuenta mientras tanto. Forzar
// una recarga real evita mostrar datos de una cuenta distinta a la actual (S3-12).
export function BfcacheReload() {
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted && isBackForwardNavigation()) {
        window.location.reload();
      }
    }

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  return null;
}
