import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { trimToNull } from '../../common/transforms';

// Una imagen ya subida con POST /api/media: se reenvía lo que esa respuesta devolvió.
export class PostMediaInputDto {
  @ApiProperty({ example: 'users/0a1b2c/qzv8xj9f2k' })
  @IsString({ message: 'debe ser texto' })
  @IsNotEmpty({ message: 'es obligatorio' })
  publicId!: string;

  @ApiProperty({ example: 1200, minimum: 1 })
  @IsInt({ message: 'debe ser un entero' })
  @Min(1, { message: 'debe ser mayor que 0' })
  width!: number;

  @ApiProperty({ example: 800, minimum: 1 })
  @IsInt({ message: 'debe ser un entero' })
  @Min(1, { message: 'debe ser mayor que 0' })
  height!: number;
}

// POST /posts (RN03): texto de hasta 2000 caracteres, hasta 4 imágenes, o ambos.
// Que no lleguen vacíos los dos lo revisa PostsService, porque depende de los dos campos.
export class CreatePostDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 2000,
    example: 'Primer atardecer del semestre',
  })
  @Transform(trimToNull)
  @IsOptional()
  @IsString({ message: 'debe ser texto' })
  @MaxLength(2000, { message: 'máximo 2000 caracteres' })
  content?: string | null;

  @ApiPropertyOptional({
    type: [PostMediaInputDto],
    maxItems: 4,
    description: 'En el orden en que se muestran',
  })
  @IsOptional()
  @IsArray({ message: 'debe ser una lista' })
  @ArrayMaxSize(4, { message: 'máximo 4 imágenes' })
  @ArrayUnique((media: PostMediaInputDto) => media.publicId, {
    message: 'una imagen está repetida',
  })
  @ValidateNested({ each: true })
  @Type(() => PostMediaInputDto)
  media?: PostMediaInputDto[];
}
