import type { TransformFnParams } from 'class-transformer';

// Para @Transform(trim) en los DTOs: quita espacios al inicio y al final antes de validar.
// Si el valor no es texto lo deja igual, y @IsString responde el 400.
export const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;
