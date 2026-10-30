import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { trim } from '../../common/transforms';

// POST /conversations: con quién abrir el chat. Se busca sin distinguir mayúsculas.
export class OpenConversationDto {
  @ApiProperty({ example: 'ana_lopez' })
  @Transform(trim)
  @IsString({ message: 'debe ser texto' })
  @IsNotEmpty({ message: 'es obligatorio' })
  @MaxLength(30, { message: 'máximo 30 caracteres' })
  username!: string;
}
