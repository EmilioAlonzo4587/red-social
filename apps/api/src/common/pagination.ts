import { BadRequestException } from '@nestjs/common';

// Paginación por cursor (docs/05-api.md): páginas de 20, orden (created_at, id) descendente
// y nunca OFFSET. El cursor es opaco para la web: base64url de { createdAt, id }.
export const PAGE_SIZE = 20;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

// createdAt va como texto con microsegundos, tal como lo guarda PostgreSQL. Un Date de JS
// solo llega a milisegundos: con él, las filas creadas en el mismo milisegundo que la última
// de la página se saltarían. Por eso las listas usan $queryRaw y seleccionan la columna con
// cursorAt('f.created_at'), y comparan con (${createdAt}::timestamptz, ${id}::uuid).
export interface CursorKey {
  createdAt: string;
  id: string;
}

// SQL que convierte una columna timestamptz en el texto que espera el cursor:
// 2026-10-28T01:02:03.123456Z (UTC, siempre 6 decimales)
export const CURSOR_AT_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"';

const CREATED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(key: CursorKey): string {
  return Buffer.from(JSON.stringify(key)).toString('base64url');
}

// Un cursor que la api no generó responde 400 con el formato único de error
export function decodeCursor(raw: string | undefined): CursorKey | null {
  if (raw === undefined) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('createdAt' in parsed) ||
    !('id' in parsed)
  ) {
    throw invalidCursor();
  }
  const { createdAt, id } = parsed;
  if (
    typeof createdAt !== 'string' ||
    !CREATED_AT.test(createdAt) ||
    Number.isNaN(Date.parse(createdAt)) ||
    typeof id !== 'string' ||
    !UUID.test(id)
  ) {
    throw invalidCursor();
  }
  return { createdAt, id };
}

// Recibe hasta PAGE_SIZE + 1 filas: si llegó la fila de más, hay otra página
export function toPage<R extends CursorKey, T>(
  rows: R[],
  toItem: (row: R) => T,
): Page<T> {
  const items = rows.slice(0, PAGE_SIZE);
  const last = items.at(-1);
  return {
    items: items.map(toItem),
    nextCursor:
      rows.length > PAGE_SIZE && last
        ? encodeCursor({ createdAt: last.createdAt, id: last.id })
        : null,
  };
}

function invalidCursor(): BadRequestException {
  return new BadRequestException({
    message: 'cursor: no es válido',
    details: [{ field: 'cursor', rule: 'cursor' }],
  });
}
