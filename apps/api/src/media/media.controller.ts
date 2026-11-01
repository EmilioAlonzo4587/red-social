import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session.guard';
import { ApiError, ApiSession } from '../common/api-docs';
import { CloudinaryService } from './cloudinary.service';
import { MediaDto } from './dto/media.dto';

// RN03: solo jpeg, png o webp, hasta 5 MB.
const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@ApiTags('media')
@ApiSession()
@Controller('media')
export class MediaController {
  constructor(private readonly cloudinary: CloudinaryService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'jpeg, png o webp de hasta 5 MB (RN03)',
        },
      },
    },
  })
  @ApiCreatedResponse({
    type: MediaDto,
    description:
      'Subida a users/{id}/ en Cloudinary; publicId, width y height se reenvían tal cual en POST /api/posts o PATCH /api/users/me',
  })
  @ApiError(
    400,
    'Falta el archivo o no es jpeg, png o webp (Cloudinary también revisa el formato real)',
    {
      summary: 'Falta el archivo',
      message: 'file: es obligatorio',
      details: [{ field: 'file', rule: 'required' }],
    },
    {
      summary: 'Formato no permitido',
      message: 'file: debe ser jpeg, png o webp',
      details: [{ field: 'file', rule: 'mimeType' }],
    },
  )
  @ApiError(413, 'El archivo pasa de 5 MB (RN03). El mensaje es el de multer', {
    summary: 'Archivo grande',
    message: 'File too large',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SIZE_BYTES },
      fileFilter: (_req, file, callback) => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          callback(
            new BadRequestException({
              message: 'file: debe ser jpeg, png o webp',
              details: [{ field: 'file', rule: 'mimeType' }],
            }),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: SessionUser,
  ): Promise<MediaDto> {
    if (!file) {
      throw new BadRequestException({
        message: 'file: es obligatorio',
        details: [{ field: 'file', rule: 'required' }],
      });
    }
    const uploaded = await this.cloudinary.uploadImage(file.buffer, user.id);
    return { ...uploaded, mediaType: 'image' };
  }
}
