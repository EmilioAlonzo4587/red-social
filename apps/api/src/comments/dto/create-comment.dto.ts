import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { trim } from '../../common/transforms';

// POST /posts/:id/comments (RN07): de 1 a 1000 caracteres sin contar los espacios del
// inicio y del final. Mismo límite que la columna content VARCHAR(1000).
export class CreateCommentDto {
  @ApiProperty({ minLength: 1, maxLength: 1000, example: 'Qué buena foto' })
  @Transform(trim)
  @IsString({ message: 'debe ser texto' })
  @IsNotEmpty({ message: 'es obligatorio' })
  @MaxLength(1000, { message: 'máximo 1000 caracteres' })
  content!: string;

  // S4-14: para responder un comentario de la misma publicación. Si es una respuesta,
  // la nueva se agrega a su mismo hilo (un solo nivel).
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Comentario al que se responde',
  })
  @IsOptional()
  @IsUUID('all', { message: 'debe ser un UUID' })
  parentId?: string;
}
