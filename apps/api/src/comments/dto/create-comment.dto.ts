import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
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
}
