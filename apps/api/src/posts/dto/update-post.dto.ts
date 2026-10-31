import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, ValidateIf } from 'class-validator';
import { trimToNull } from '../../common/transforms';

// PATCH /posts/:id: solo el texto se edita; las imágenes quedan como estaban.
// null (o solo espacios) borra el texto, y PostsService lo rechaza si la publicación
// no tiene imágenes, porque quedaría vacía (RN03).
export class UpdatePostDto {
  @ApiProperty({
    type: String,
    nullable: true,
    maxLength: 2000,
    example: 'Primer atardecer del semestre (editado)',
  })
  @Transform(trimToNull)
  @ValidateIf((dto: UpdatePostDto) => dto.content !== null)
  @IsString({ message: 'debe ser texto' })
  @MaxLength(2000, { message: 'máximo 2000 caracteres' })
  content!: string | null;
}
