import { JwtService } from '@nestjs/jwt';
import { SessionTokenService } from './session-token.service';

describe('SessionTokenService', () => {
  // El mismo JwtService que arma AuthModule, con un secreto de prueba
  const jwt = new JwtService({
    secret: 'x'.repeat(32),
    signOptions: { algorithm: 'HS256', expiresIn: 900 },
    verifyOptions: { algorithms: ['HS256'] },
  });
  const tokens = new SessionTokenService(jwt);

  it('devuelve el usuario y el vencimiento en milisegundos', async () => {
    const token = await jwt.signAsync({ sub: 'u1' });
    const claims = await tokens.verify(token);
    expect(claims?.userId).toBe('u1');
    // exp = ahora + 900 s, con un margen de un par de segundos
    expect(claims!.expiresAt - Date.now()).toBeGreaterThan(898_000);
    expect(claims!.expiresAt - Date.now()).toBeLessThanOrEqual(900_000);
  });

  it('null con un token vencido', async () => {
    const token = await jwt.signAsync({ sub: 'u1' }, { expiresIn: -10 });
    expect(await tokens.verify(token)).toBeNull();
  });

  it('null con un token firmado con otro secreto', async () => {
    const other = new JwtService({ secret: 'y'.repeat(32) });
    expect(
      await tokens.verify(await other.signAsync({ sub: 'u1' })),
    ).toBeNull();
  });

  it.each([undefined, '', 'falso', 42])(
    'null sin token válido: %p',
    async (value) => {
      expect(await tokens.verify(value)).toBeNull();
    },
  );
});
