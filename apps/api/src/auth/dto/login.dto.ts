import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { trim } from '../../common/transforms';

export class LoginDto {
  // Usuario o correo: si contiene @ se busca por correo (docs/05-api.md)
  @ApiProperty({ example: 'ana_lopez' })
  @Transform(trim)
  @IsString({ message: 'debe ser texto' })
  @IsNotEmpty({ message: 'es obligatorio' })
  @MaxLength(254, { message: 'máximo 254 caracteres' })
  identifier!: string;

  @ApiProperty({ example: 'una-clave-larga' })
  @IsString({ message: 'debe ser texto' })
  @IsNotEmpty({ message: 'es obligatorio' })
  @MaxLength(128, { message: 'máximo 128 caracteres' })
  password!: string;
}
