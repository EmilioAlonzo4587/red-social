import { ApiProperty } from '@nestjs/swagger';

// Objeto Me de docs/05-api.md: el usuario con sesión. Nunca lleva passwordHash.
export class MeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ana_lopez' })
  username!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Ana López' })
  displayName!: string | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  avatarPublicId!: string | null;

  @ApiProperty({ example: 'ana@example.com' })
  email!: string;

  @ApiProperty({ type: String, nullable: true, example: null })
  bio!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
