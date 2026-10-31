import { ApiProperty } from '@nestjs/swagger';
import { UserSummaryDto } from '../../users/dto/user-summary.dto';

// Objeto Comment de docs/05-api.md
export class CommentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  postId!: string;

  @ApiProperty({ type: UserSummaryDto })
  author!: UserSummaryDto;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Qué buena foto',
    description:
      'null si el comentario fue eliminado (se muestra porque tiene respuestas)',
  })
  content!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Comentario de primer nivel del hilo; null si no es una respuesta (S4-14)',
  })
  parentId!: string | null;

  @ApiProperty({
    example: 2,
    description: 'Respuestas visibles; siempre 0 en una respuesta',
  })
  replyCount!: number;

  @ApiProperty({
    example: false,
    description:
      'Eliminado: solo aparece en la lista si todavía tiene respuestas, sin texto',
  })
  deleted!: boolean;
}

// Page<Comment> de docs/05-api.md
export class CommentPageDto {
  @ApiProperty({ type: [CommentDto] })
  items!: CommentDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Se manda como ?cursor= para la siguiente página; null en la última',
  })
  nextCursor!: string | null;
}
