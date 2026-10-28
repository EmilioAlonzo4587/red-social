import { BadRequestException } from '@nestjs/common';
import {
  decodeCursor,
  encodeCursor,
  PAGE_SIZE,
  toPage,
  type CursorKey,
} from './pagination';

const key: CursorKey = {
  createdAt: '2026-10-28T01:02:03.123456Z',
  id: '01a18006-60f6-7583-8a4b-a8c3a30dd74c',
};

const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

describe('pagination', () => {
  it('decodeCursor devuelve lo que codificó encodeCursor, con microsegundos', () => {
    expect(decodeCursor(encodeCursor(key))).toEqual(key);
  });

  it('sin cursor es la primera página', () => {
    expect(decodeCursor(undefined)).toBeNull();
  });

  it.each([
    ['texto que no es base64 de un JSON', 'no-es-un-cursor'],
    ['JSON que no es objeto', encode('hola')],
    ['falta id', encode({ createdAt: key.createdAt })],
    ['id que no es uuid', encode({ ...key, id: "1' OR '1'='1" })],
    [
      'fecha sin microsegundos',
      encode({ ...key, createdAt: '2026-10-28T01:02:03Z' }),
    ],
    [
      'fecha imposible',
      encode({ ...key, createdAt: '2026-13-45T01:02:03.123456Z' }),
    ],
  ])('400 con %s', (_caso, raw) => {
    expect(() => decodeCursor(raw)).toThrow(BadRequestException);
  });

  describe('toPage', () => {
    const rows = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        ...key,
        id: `${i}`,
        name: `u${i}`,
      }));
    const toItem = ({ name }: CursorKey & { name: string }) => name;

    it('con la fila de más devuelve PAGE_SIZE y el cursor de la última', () => {
      const page = toPage(rows(PAGE_SIZE + 1), toItem);
      expect(page.items).toHaveLength(PAGE_SIZE);
      expect(
        JSON.parse(Buffer.from(page.nextCursor ?? '', 'base64url').toString()),
      ).toEqual({
        createdAt: key.createdAt,
        id: `${PAGE_SIZE - 1}`,
      });
    });

    it('sin la fila de más es la última página', () => {
      expect(toPage(rows(PAGE_SIZE), toItem).nextCursor).toBeNull();
      expect(toPage([], toItem)).toEqual({ items: [], nextCursor: null });
    });
  });
});
