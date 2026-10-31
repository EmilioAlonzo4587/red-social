import { ApiProperty } from '@nestjs/swagger';
import { REACTIONS, type ReactionType } from '../reactions';

// Respuesta de PUT y DELETE /posts/:id/like (docs/05-api.md)
export class LikeStatusDto {
  @ApiProperty({ example: 25, description: 'Total de reacciones' })
  likeCount!: number;

  @ApiProperty({ example: true })
  likedByMe!: boolean;

  @ApiProperty({
    enum: REACTIONS,
    nullable: true,
    example: 'love',
    description: 'La reacción del usuario con sesión; null si no reaccionó',
  })
  myReaction!: ReactionType | null;

  @ApiProperty({
    enum: REACTIONS,
    isArray: true,
    example: ['like', 'love'],
    description:
      'Hasta 3, de la más usada a la menos usada; un empate sigue el orden de la lista',
  })
  topReactions!: ReactionType[];
}
