import { ApiProperty } from '@nestjs/swagger';

// Objeto UserSummary de docs/05-api.md: autor, actor de notificaciones, resultado de
// búsqueda o fila de una lista de seguidores. La web muestra displayName y, si es null, username.
export class UserSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ana_lopez' })
  username!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Ana López' })
  displayName!: string | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  avatarPublicId!: string | null;
}
