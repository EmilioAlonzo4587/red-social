import { ApiProperty } from '@nestjs/swagger';

// Respuesta de PUT y DELETE /users/:username/follow. followerCount permite actualizar el
// perfil sin volver a pedirlo.
export class FollowStatusDto {
  @ApiProperty({ example: true })
  isFollowing!: boolean;

  @ApiProperty({ example: 31 })
  followerCount!: number;
}
