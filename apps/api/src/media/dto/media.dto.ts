import { ApiProperty } from '@nestjs/swagger';

// Respuesta de POST /api/media (docs/05-api.md). mediaType queda fijo en "image":
// por ahora Cloudinary solo recibe imágenes (RN03).
export class MediaDto {
  @ApiProperty({ example: 'users/0a1b2c/qzv8xj9f2k' })
  publicId!: string;

  @ApiProperty({ example: 'image', enum: ['image'] })
  mediaType!: 'image';

  @ApiProperty({ example: 1200 })
  width!: number;

  @ApiProperty({ example: 800 })
  height!: number;
}
