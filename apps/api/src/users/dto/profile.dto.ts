import { ApiProperty } from '@nestjs/swagger';

// Objeto Profile de docs/05-api.md: el perfil de cualquier usuario. Nunca lleva el correo.
export class ProfileDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ana_lopez' })
  username!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Ana López' })
  displayName!: string | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  avatarPublicId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Me gusta la fotografía',
  })
  bio!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ example: 12, description: 'Sin contar las eliminadas' })
  postCount!: number;

  @ApiProperty({ example: 30 })
  followerCount!: number;

  @ApiProperty({ example: 25 })
  followingCount!: number;

  @ApiProperty({
    example: false,
    description: 'Si el usuario con sesión lo sigue; false en el perfil propio',
  })
  isFollowing!: boolean;
}
