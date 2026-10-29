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

  @ApiProperty({ example: 'Qué buena foto' })
  content!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
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
