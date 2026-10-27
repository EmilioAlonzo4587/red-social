import { PrismaClient } from '@prisma/client';

// Vacía todas las tablas menos el historial de migraciones de Prisma. Cada archivo e2e lo llama
// en beforeEach para que una prueba no dependa de lo que dejó otra. format('%I') pone comillas
// a cada nombre de tabla dentro de la base, así no se arma SQL concatenando texto en TypeScript.
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRaw`
    DO $$
    DECLARE tables text;
    BEGIN
      SELECT string_agg(format('%I', tablename), ', ') INTO tables
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';
      EXECUTE 'TRUNCATE TABLE ' || tables || ' RESTART IDENTITY CASCADE';
    END $$;
  `;
}
