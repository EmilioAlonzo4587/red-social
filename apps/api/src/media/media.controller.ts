import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session.guard';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { CloudinaryService } from './cloudinary.service';
import { MediaDto } from './dto/media.dto';

// RN03: solo jpeg, png o webp, hasta 5 MB.
const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@ApiTags('media')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller('media')
export class MediaController {
  constructor(private readonly cloudinary: CloudinaryService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ type: MediaDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Falta el archivo o no es jpeg, png o webp',
  })
  @ApiResponse({
    status: 413,
    type: ErrorResponseDto,
    description: 'El archivo pasa de 5 MB',
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
