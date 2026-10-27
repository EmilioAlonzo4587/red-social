import type { Response } from 'supertest';

export interface ParsedCookie {
  value: string;
  attributes: string; // el resto de la cabecera: Path, HttpOnly, SameSite, Max-Age...
}

// Lee las cabeceras Set-Cookie de una respuesta: { access_token: { value, attributes } }
export function cookiesOf(res: Response): Record<string, ParsedCookie> {
  const header = res.headers['set-cookie'] as string[] | string | undefined;
  const list = Array.isArray(header) ? header : header ? [header] : [];
  return Object.fromEntries(
    list.map((line) => {
      const [pair, ...rest] = line.split('; ');
      const index = pair.indexOf('=');
      return [
        pair.slice(0, index),
        {
          value: decodeURIComponent(pair.slice(index + 1)),
          attributes: rest.join('; '),
        },
      ];
    }),
  );
}
