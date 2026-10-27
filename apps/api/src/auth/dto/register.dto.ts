import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { trim } from '../../common/transforms';

// Mismos límites que la base (CHECK users_username_format) y que RN01 y RN02
export class RegisterDto {
  @ApiProperty({ example: 'ana_lopez', minLength: 3, maxLength: 30 })
  @Transform(trim)
  @IsString({ message: 'debe ser texto' })
  @MinLength(3, { message: 'mínimo 3 caracteres' })
  @MaxLength(30, { message: 'máximo 30 caracteres' })
  @Matches(/^[A-Za-z0-9_]+$/, {
    message: 'solo letras, números y guion bajo',
  })
  username!: string;

  @ApiProperty({ example: 'ana@example.com', maxLength: 254 })
  @Transform(trim)
  @IsString({ message: 'debe ser texto' })
  @MaxLength(254, { message: 'máximo 254 caracteres' })
  @IsEmail({}, { message: 'correo no válido' })
  email!: string;

  // Sin trim: los espacios son parte de la contraseña. Máximo 128 para que nadie
  // mande un texto enorme y ocupe el CPU calculando el hash.
  @ApiProperty({ example: 'una-clave-larga', minLength: 8, maxLength: 128 })
  @IsString({ message: 'debe ser texto' })
  @MinLength(8, { message: 'mínimo 8 caracteres' })
  @MaxLength(128, { message: 'máximo 128 caracteres' })
  password!: string;
}
