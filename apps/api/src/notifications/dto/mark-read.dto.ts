import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsUUID,
  ValidateBy,
  ValidateIf,
  type ValidationArguments,
} from 'class-validator';

// Las ids de una página o un poco más: la web marca lo que tiene en pantalla
export const MAX_READ_IDS = 100;

// El campo no puede venir junto con `other`
function NotWith(other: string) {
  return ValidateBy({
    name: 'notWith',
    constraints: [other],
    validator: {
      validate: (_value: unknown, args?: ValidationArguments) =>
        (args?.object as Record<string, unknown> | undefined)?.[other] ===
        undefined,
      defaultMessage: () => `no se puede mandar junto con ${other}`,
    },
  });
}

// POST /notifications/read (docs/05-api.md): { ids } marca esas, { all: true } todas.
// Exactamente uno de los dos: sin ninguno, los dos campos fallan; con ambos, falla all.
export class MarkReadDto {
  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    maxItems: MAX_READ_IDS,
    description:
      'Notificaciones a marcar; las ajenas o inexistentes se ignoran',
  })
  @ValidateIf(
    (dto: MarkReadDto) => dto.ids !== undefined || dto.all === undefined,
  )
  @IsUUID('all', { each: true, message: 'cada id debe ser un UUID' })
  @ArrayMaxSize(MAX_READ_IDS, { message: `máximo ${MAX_READ_IDS} ids` })
  @ArrayMinSize(1, { message: 'al menos una id' })
  @IsArray({ message: 'debe ser una lista de ids' })
  ids?: string[];

  @ApiPropertyOptional({ enum: [true], description: 'Marca todas' })
  @ValidateIf(
    (dto: MarkReadDto) => dto.all !== undefined || dto.ids === undefined,
  )
  @NotWith('ids')
  @Equals(true, { message: 'debe ser true' })
  all?: true;
}
