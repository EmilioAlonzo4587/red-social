import type { CookieOptions, Response } from 'express';
import type { Env } from '../config/env';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
// El refresh solo viaja a /api/auth/*: el resto de las rutas nunca lo recibe
const REFRESH_PATH = '/api/auth';

function baseOptions(env: Env): CookieOptions {
  return {
    httpOnly: true, // JavaScript del navegador no puede leerla (protege contra XSS)
    secure: env.isProduction, // solo por HTTPS; en local se usa http://localhost
    sameSite: 'lax', // no viaja en peticiones POST que empiezan en otro sitio (CSRF)
  };
}

export function setSessionCookies(
  res: Response,
  env: Env,
  accessToken: string,
  refreshToken: string,
): void {
  // Las dos cookies duran lo que el refresh. El JWT de adentro vence a los 15 minutos,
  // pero la cookie sigue ahí para que proxy.ts de la web sepa que hay sesión y el cliente
  // llame a /api/auth/refresh cuando reciba un 401.
  const maxAge = env.refreshTokenTtlDays * 24 * 60 * 60 * 1000;
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseOptions(env),
    path: '/',
    maxAge,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseOptions(env),
    path: REFRESH_PATH,
    maxAge,
  });
}

export function clearSessionCookies(res: Response, env: Env): void {
  // Para borrar una cookie hay que repetir su path; si no, el navegador la conserva
  res.clearCookie(ACCESS_COOKIE, { ...baseOptions(env), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...baseOptions(env), path: REFRESH_PATH });
}
