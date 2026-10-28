import { Module } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';
import { MediaController } from './media.controller';

// CloudinaryService se exporta para que publicaciones (S2-04) y avatar (S2-11) puedan
// validar y borrar imágenes sin repetir la conexión a Cloudinary.
@Module({
  controllers: [MediaController],
  providers: [CloudinaryService],
  exports: [CloudinaryService],
})
export class MediaModule {}
