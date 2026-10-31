import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { REACTIONS, type ReactionType } from '../reactions';

// PUT /posts/:id/like (S4-12). Sin reaction cuenta como Me gusta.
export class ReactToPostDto {
  @ApiPropertyOptional({
    enum: REACTIONS,
    default: 'like',
    example: 'love',
  })
  @IsOptional()
  @IsIn(REACTIONS, { message: 'no es una reacción válida' })
  reaction?: ReactionType;
}
