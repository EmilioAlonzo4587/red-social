// Variables de entorno que la api necesita para arrancar. Se leen y validan una sola vez:
// si falta una o tiene un formato inválido, la api no arranca y el error dice cuál es.
export interface Env {
  jwtAccessSecret: string;
  /** Vida del token de acceso, en segundos (JWT_ACCESS_TTL, por ejemplo "15m"). */
  jwtAccessTtlSeconds: number;
  /** Vida del token de renovación, en días (REFRESH_TOKEN_TTL_DAYS). */
  refreshTokenTtlDays: number;
  /** Origen de la web (CORS_ORIGIN, por ejemplo https://ejemplo.com). Socket.io solo lo acepta a él. */
  corsOrigin: string;
  /** En producción las cookies llevan Secure (solo viajan por HTTPS). */
  isProduction: boolean;
  cloudinaryCloudName: string;
  cloudinaryApiKey: string;
  cloudinaryApiSecret: string;
}

export const ENV = Symbol('ENV');

const DURATION_UNITS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

function required(source: NodeJS.ProcessEnv, name: string): string {
  const value = source[name]?.trim();
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

// "15m" -> 900. Acepta s, m, h y d.
function parseDuration(name: string, value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) {
    throw new Error(
      `${name} debe ser un número seguido de s, m, h o d (por ejemplo 15m)`,
    );
  }
  return Number(match[1]) * DURATION_UNITS[match[2]];
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const jwtAccessSecret = required(source, 'JWT_ACCESS_SECRET');
  // HS256 firma con este secreto: uno corto se puede adivinar por fuerza bruta
  if (jwtAccessSecret.length < 32) {
    throw new Error('JWT_ACCESS_SECRET debe tener al menos 32 caracteres');
  }

  const jwtAccessTtlSeconds = parseDuration(
    'JWT_ACCESS_TTL',
    required(source, 'JWT_ACCESS_TTL'),
  );

  const refreshTokenTtlDays = Number(
    required(source, 'REFRESH_TOKEN_TTL_DAYS'),
  );
  if (!Number.isInteger(refreshTokenTtlDays) || refreshTokenTtlDays < 1) {
    throw new Error('REFRESH_TOKEN_TTL_DAYS debe ser un número entero de días');
  }

  // Un origen es esquema + dominio + puerto, sin ruta ni / final: así lo manda el navegador
  // en la cabecera Origin, y la comparación es texto exacto
  const corsOrigin = required(source, 'CORS_ORIGIN');
  if (!URL.canParse(corsOrigin) || new URL(corsOrigin).origin !== corsOrigin) {
    throw new Error(
      'CORS_ORIGIN debe ser un origen como https://ejemplo.com, sin / al final',
    );
  }

  return {
    jwtAccessSecret,
    jwtAccessTtlSeconds,
    refreshTokenTtlDays,
    corsOrigin,
    isProduction: source.NODE_ENV === 'production',
    cloudinaryCloudName: required(source, 'CLOUDINARY_CLOUD_NAME'),
    cloudinaryApiKey: required(source, 'CLOUDINARY_API_KEY'),
    cloudinaryApiSecret: required(source, 'CLOUDINARY_API_SECRET'),
  };
}
