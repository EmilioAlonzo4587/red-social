import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

// ?cursor= de las listas paginadas. Su contenido lo valida decodeCursor (common/pagination.ts).
export class CursorQueryDto {
  @ApiPropertyOptional({
    description: 'nextCursor de la página anterior, tal cual',
  })
  @IsOptional()
  @IsString({ message: 'debe ser texto' })
  @MaxLength(200, { message: 'máximo 200 caracteres' })
  cursor?: string;
}
