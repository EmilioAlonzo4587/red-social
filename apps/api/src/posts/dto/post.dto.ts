import { ApiProperty } from '@nestjs/swagger';
import { REACTIONS, type ReactionType } from '../../likes/reactions';
import { MediaDto } from '../../media/dto/media.dto';
import { UserSummaryDto } from '../../users/dto/user-summary.dto';

// Objeto Post de docs/05-api.md. Lo devuelven POST /posts, GET /posts/:id y los feeds (S2-05).
export class PostDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: UserSummaryDto })
  author!: UserSummaryDto;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Primer atardecer del semestre',
  })
  content!: string | null;

  @ApiProperty({
    type: [MediaDto],
    description: 'En el orden de subida, máximo 4 (RN03)',
  })
  media!: MediaDto[];

  @ApiProperty({ example: 24 })
  likeCount!: number;

  @ApiProperty({ example: 5 })
  commentCount!: number;

  @ApiProperty({
    example: false,
    description: 'Si el usuario con sesión le dio like',
  })
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

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Última vez que el autor editó el texto; null si nunca se editó',
  })
  editedAt!: Date | null;
}
