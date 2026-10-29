import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { trim } from '../../common/transforms';

// GET /users/search?q= (RN14): al menos 2 caracteres sin contar los espacios del inicio y
// del final. El máximo es el largo de display_name: nadie se llama con más.
export class SearchUsersQueryDto {
  @ApiProperty({ minLength: 2, maxLength: 80, example: 'ana' })
  @Transform(trim)
  @IsString({ message: 'debe ser texto' })
  @MinLength(2, { message: 'mínimo 2 caracteres' })
  @MaxLength(80, { message: 'máximo 80 caracteres' })
  q!: string;
}
