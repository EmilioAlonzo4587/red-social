import type { Env } from '../config/env';
import { CloudinaryService } from './cloudinary.service';

// belongsToUser es la única lógica propia del servicio: subir y borrar son llamadas
// directas al SDK de Cloudinary, verificadas a mano contra la cuenta real.
describe('CloudinaryService', () => {
  const env: Env = {
    jwtAccessSecret: 'x'.repeat(32),
    jwtAccessTtlSeconds: 900,
    refreshTokenTtlDays: 7,
    isProduction: false,
    cloudinaryCloudName: 'demo',
    cloudinaryApiKey: 'demo-key',
    cloudinaryApiSecret: 'demo-secret',
  };
  const service = new CloudinaryService(env);

  describe('belongsToUser', () => {
    it('true si el publicId está en la carpeta del usuario', () => {
      expect(service.belongsToUser('users/u1/abc123', 'u1')).toBe(true);
    });

    it('false si es la carpeta de otro usuario', () => {
      expect(service.belongsToUser('users/u2/abc123', 'u1')).toBe(false);
    });

    it('false si solo coincide el prefijo sin la barra (RN04: u10 no es u1)', () => {
      expect(service.belongsToUser('users/u10/abc123', 'u1')).toBe(false);
    });
  });
});
