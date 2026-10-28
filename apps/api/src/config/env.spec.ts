import { loadEnv } from './env';

describe('loadEnv', () => {
  const valid = {
    JWT_ACCESS_SECRET: 'x'.repeat(32),
    JWT_ACCESS_TTL: '15m',
    REFRESH_TOKEN_TTL_DAYS: '7',
    CLOUDINARY_CLOUD_NAME: 'demo',
    CLOUDINARY_API_KEY: 'demo-key',
    CLOUDINARY_API_SECRET: 'demo-secret',
  };

  it('convierte las duraciones', () => {
    expect(loadEnv(valid)).toEqual({
      jwtAccessSecret: 'x'.repeat(32),
      jwtAccessTtlSeconds: 900,
      refreshTokenTtlDays: 7,
      isProduction: false,
      cloudinaryCloudName: 'demo',
      cloudinaryApiKey: 'demo-key',
      cloudinaryApiSecret: 'demo-secret',
    });
  });

  it('falla si falta una variable de cloudinary', () => {
    expect(() => loadEnv({ ...valid, CLOUDINARY_CLOUD_NAME: '' })).toThrow(
      'Falta la variable de entorno CLOUDINARY_CLOUD_NAME',
    );
  });

  it('falla si falta el secreto', () => {
    expect(() => loadEnv({ ...valid, JWT_ACCESS_SECRET: '' })).toThrow(
      'Falta la variable de entorno JWT_ACCESS_SECRET',
    );
  });

  it('falla con un secreto corto', () => {
    expect(() => loadEnv({ ...valid, JWT_ACCESS_SECRET: 'corto' })).toThrow(
      'al menos 32 caracteres',
    );
  });

  it('falla con una duración sin unidad', () => {
    expect(() => loadEnv({ ...valid, JWT_ACCESS_TTL: '900' })).toThrow(
      'JWT_ACCESS_TTL',
    );
  });

  it('Secure solo en producción', () => {
    expect(loadEnv({ ...valid, NODE_ENV: 'production' }).isProduction).toBe(
      true,
    );
  });
});
