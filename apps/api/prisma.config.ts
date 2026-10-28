import { defineConfig } from 'prisma/config';

// Reemplaza la configuración deprecada package.json#prisma (Prisma 7 la elimina).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'ts-node prisma/seed.ts',
  },
});
