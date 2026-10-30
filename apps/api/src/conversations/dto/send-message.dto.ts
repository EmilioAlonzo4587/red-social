import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { trim } from '../../common/transforms';

// POST /conversations/:id/messages (RN09): de 1 a 2000 caracteres sin contar los espacios
// del inicio y del final. Mismo límite que la columna content VARCHAR(2000).
export class SendMessageDto {
  @ApiProperty({ minLength: 1, maxLength: 2000, example: 'Hola, ¿cómo vas?' })
  @Transform(trim)
  @IsString({ message: 'debe ser texto' })
  @IsNotEmpty({ message: 'es obligatorio' })
  @MaxLength(2000, { message: 'máximo 2000 caracteres' })
  content!: string;
}
