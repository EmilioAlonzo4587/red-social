import { ApiProperty } from '@nestjs/swagger';
import { UserSummaryDto } from '../../users/dto/user-summary.dto';
import { REACTIONS, type ReactionType } from '../reactions';

// Una fila de GET /posts/:id/reactions (docs/05-api.md)
export class RecentReactionDto {
  @ApiProperty({ type: UserSummaryDto, description: 'Quién reaccionó' })
  user!: UserSummaryDto;

  @ApiProperty({ enum: REACTIONS, example: 'love' })
  reaction!: ReactionType;

  @ApiProperty({
    description:
      'Cuándo reaccionó por primera vez; cambiar de reacción no la mueve',
  })
  createdAt!: Date;
}

// Respuesta de GET /posts/:id/reactions (S4-16)
export class RecentReactionsDto {
  @ApiProperty({ example: 25, description: 'Total de reacciones' })
  total!: number;

  @ApiProperty({
    type: RecentReactionDto,
    isArray: true,
    description: 'Hasta 5, de la más reciente a la más antigua',
  })
  items!: RecentReactionDto[];
}
