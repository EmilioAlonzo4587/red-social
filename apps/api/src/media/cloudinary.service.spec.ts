import { BadRequestException } from '@nestjs/common';
import { v2 as cloudinary, type UploadApiOptions } from 'cloudinary';
import type { Env } from '../config/env';
import { CloudinaryService } from './cloudinary.service';

// La lógica propia del servicio: belongsToUser, las opciones de subida y cómo se traducen los
// errores del SDK. La subida real se verifica a mano contra la cuenta (el SDK se simula aquí).
describe('CloudinaryService', () => {
  const env: Env = {
    jwtAccessSecret: 'x'.repeat(32),
    jwtAccessTtlSeconds: 900,
    refreshTokenTtlDays: 7,
    corsOrigin: 'http://localhost:3001',
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

  describe('uploadImage', () => {
    type Callback = (
      error?: { message: string; http_code: number },
      result?: { public_id: string; width: number; height: number },
    ) => void;

    // Simula upload_stream: guarda las opciones y responde con lo que se le indique
    function mockUpload(
      respond: (callback: Callback) => void,
    ): jest.SpyInstance {
      return jest
        .spyOn(cloudinary.uploader, 'upload_stream')
        .mockImplementation(((
          _options: UploadApiOptions,
          callback: Callback,
        ) => ({ end: () => respond(callback) })) as never);
    }

    afterEach(() => jest.restoreAllMocks());

    it('sube a users/{id}/ solo con los formatos permitidos y devuelve las medidas', async () => {
      const spy = mockUpload((cb) =>
        cb(undefined, { public_id: 'users/u1/abc', width: 10, height: 20 }),
      );
      await expect(
        service.uploadImage(Buffer.from('x'), 'u1'),
      ).resolves.toEqual({ publicId: 'users/u1/abc', width: 10, height: 20 });
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          folder: 'users/u1',
          resource_type: 'image',
          allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        }),
        expect.any(Function),
      );
    });

    it('400 con rule mimeType si Cloudinary rechaza el formato real (por ejemplo un SVG)', async () => {
      mockUpload((cb) =>
        cb({ message: 'Image format svg not allowed', http_code: 400 }),
      );
      const error: unknown = await service
        .uploadImage(Buffer.from('<svg/>'), 'u1')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual({
        message: 'file: debe ser jpeg, png o webp',
        details: [{ field: 'file', rule: 'mimeType' }],
      });
    });

    it('otro error de Cloudinary no se convierte en 400', async () => {
      mockUpload((cb) => cb({ message: 'caído', http_code: 500 }));
      const error: unknown = await service
        .uploadImage(Buffer.from('x'), 'u1')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(BadRequestException);
    });
  });
});
