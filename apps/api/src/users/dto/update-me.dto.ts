import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { trimToNull } from '../../common/transforms';

// PATCH /users/me. Un campo que falta no cambia; null (o solo espacios en displayName/bio)
// borra el valor. Mismos límites que las columnas display_name VARCHAR(80) y bio VARCHAR(300).
export class UpdateMeDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 80,
    example: 'Ana López',
  })
  @Transform(trimToNull)
  @IsOptional()
  @IsString({ message: 'debe ser texto' })
  @MaxLength(80, { message: 'máximo 80 caracteres' })
  displayName?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 300,
    example: 'Me gusta la fotografía',
  })
  @Transform(trimToNull)
  @IsOptional()
  @IsString({ message: 'debe ser texto' })
  @MaxLength(300, { message: 'máximo 300 caracteres' })
  bio?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'users/0a1b2c/qzv8xj9f2k',
    description: 'publicId que devolvió POST /api/media; null quita la foto',
  })
  @IsOptional()
  @IsString({ message: 'debe ser texto' })
  avatarPublicId?: string | null;
}
