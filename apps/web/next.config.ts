import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // Genera .next/standalone: un server.js con solo los archivos que la web usa,
  // para que la imagen de Docker no cargue todo node_modules.
  output: "standalone",
  // El monorepo, Next debe rastrear dependencias desde la raíz del repo.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // Publicaciones y avatares (S2-01/S2-09): next/image ajusta tamaño y formato solo
  // al pedirlas, sin necesitar un loader propio de Cloudinary.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
    ],
  },
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