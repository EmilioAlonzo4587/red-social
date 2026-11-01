import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  ApiError,
  ApiSession,
  INVALID_ID,
  POST_NOT_FOUND,
} from '../common/api-docs';
import { postIdPipe } from '../posts/post-id.pipe';
import { RecentReactionsDto } from './dto/recent-reactions.dto';
import { LikesService } from './likes.service';

// Quién reaccionó a una publicación (S4-16). Va aparte de LikesController porque su ruta
// es /posts/:id/reactions, no /posts/:id/like.
@ApiTags('likes')
@ApiSession()
@Controller('posts/:id/reactions')
export class ReactionsController {
  constructor(private readonly likes: LikesService) {}

  @Get()
  @ApiParam({ name: 'id', format: 'uuid', description: 'De la publicación' })
  @ApiOkResponse({
    type: RecentReactionsDto,
    description:
      'Las 5 reacciones más recientes, de la más reciente a la más antigua, y el total',
  })
  @ApiError(400, 'id no es un UUID', INVALID_ID)
  @ApiError(404, 'La publicación no existe o fue eliminada', POST_NOT_FOUND)
  recent(@Param('id', postIdPipe) id: string): Promise<RecentReactionsDto> {
    return this.likes.recent(id);
  }
}
