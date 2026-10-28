import { msUntilExpiry } from './realtime.gateway';

describe('msUntilExpiry', () => {
  const now = 1_000_000;

  it('lo que falta para el vencimiento', () => {
    expect(msUntilExpiry(now + 900_000, now)).toBe(900_000);
  });

  it('0 si ya venció', () => {
    expect(msUntilExpiry(now - 5, now)).toBe(0);
  });

  it('no pasa del máximo de setTimeout (unos 24 días)', () => {
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    expect(msUntilExpiry(now + thirtyDays, now)).toBe(2 ** 31 - 1);
  });
});
