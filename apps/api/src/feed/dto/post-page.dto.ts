import { ApiProperty } from '@nestjs/swagger';
import { PostDto } from '../../posts/dto/post.dto';

// Page<Post> de docs/05-api.md
export class PostPageDto {
  @ApiProperty({ type: [PostDto] })
  items!: PostDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Se manda como ?cursor= para la siguiente página; null en la última',
  })
  nextCursor!: string | null;
}
