// Variables de entorno de las pruebas e2e. Jest carga este archivo antes de cada archivo de
// pruebas (setupFiles en jest-e2e.json). En el CI, DATABASE_URL ya viene definida en ci.yml.
process.env.DATABASE_URL ??= 'postgresql://app:app@localhost:5432/minired_test';

// Las e2e vacían las tablas: nunca deben correr contra la base de desarrollo ni la de producción.
const dbName = new URL(process.env.DATABASE_URL).pathname.slice(1);
if (!dbName.endsWith('_test')) {
  throw new Error(
    `Las pruebas e2e borran datos y solo corren en una base que termine en _test (recibí "${dbName}")`,
  );
}
// Valores solo para pruebas: la api exige estas variables al arrancar (src/config/env.ts)
process.env.JWT_ACCESS_SECRET ??=
  'secreto-de-pruebas-e2e-de-al-menos-32-caracteres';
process.env.JWT_ACCESS_TTL ??= '15m';
process.env.REFRESH_TOKEN_TTL_DAYS ??= '7';
