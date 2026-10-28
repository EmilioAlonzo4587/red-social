import { Inject, Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { ENV, type Env } from '../config/env';

export interface UploadedImage {
  publicId: string;
  width: number;
  height: number;
}

// Envoltura del SDK de Cloudinary (D04): las claves solo viven aquí, nunca llegan al cliente.
@Injectable()
export class CloudinaryService {
  constructor(@Inject(ENV) env: Env) {
    cloudinary.config({
      cloud_name: env.cloudinaryCloudName,
      api_key: env.cloudinaryApiKey,
      api_secret: env.cloudinaryApiSecret,
      secure: true,
    });
  }

  // Sube el archivo a la carpeta del usuario (users/{userId}/), que queda como prefijo
  // del publicId (docs/05-api.md, "Imágenes").
  uploadImage(buffer: Buffer, userId: string): Promise<UploadedImage> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: `users/${userId}`, resource_type: 'image' },
        (error, result) => {
          if (error || !result) {
            reject(
              new Error(
                error?.message ?? 'Cloudinary no devolvió un resultado',
              ),
            );
            return;
          }
          resolve({
            publicId: result.public_id,
            width: result.width,
            height: result.height,
          });
        },
      );
      stream.end(buffer);
    });
  }

  async deleteByPublicId(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  }

  // Un publicId le pertenece a userId si empieza con su carpeta: así nadie usa ni borra
  // la imagen de otra persona en publicaciones o avatar (RN04).
  belongsToUser(publicId: string, userId: string): boolean {
    return publicId.startsWith(`users/${userId}/`);
  }
}
