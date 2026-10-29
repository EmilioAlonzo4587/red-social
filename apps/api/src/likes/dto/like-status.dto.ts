import { ApiProperty } from '@nestjs/swagger';

// Respuesta de PUT y DELETE /posts/:id/like (docs/05-api.md)
export class LikeStatusDto {
  @ApiProperty({ example: 25 })
  likeCount!: number;

  @ApiProperty({ example: true })
  likedByMe!: boolean;
}
