"use client";

import { useEffect } from "react";

// Si el navegador restaura la página desde su back-forward cache en vez de pedirla
// de nuevo, no pasa por el proxy ni por ninguna petición a la api: se queda con los
// datos ya pintados, aunque la sesión haya cambiado de cuenta mientras tanto. Forzar
// una recarga real evita mostrar datos de una cuenta distinta a la actual (S3-12).
export function BfcacheReload() {
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        window.location.reload();
      }
    }

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  return null;
}
