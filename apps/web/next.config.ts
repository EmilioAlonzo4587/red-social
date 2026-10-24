import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // Genera .next/standalone: un server.js con solo los archivos que la web usa,
  // para que la imagen de Docker no cargue todo node_modules.
  output: "standalone",
  // El monorepo, Next debe rastrear dependencias desde la raíz del repo.
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;