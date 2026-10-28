import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // Genera .next/standalone: un server.js con solo los archivos que la web usa,
  // para que la imagen de Docker no cargue todo node_modules.
  output: "standalone",
  // El monorepo, Next debe rastrear dependencias desde la raíz del repo.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // Solo en desarrollo: en producción Caddy ya manda /api a la api antes de llegar a Next (D02).
  // En build, API_INTERNAL_URL no existe y el destino quedaría "undefined/api/...", por eso el guard.
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_INTERNAL_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;