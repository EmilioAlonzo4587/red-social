import { Body, Controller, Delete, Param, Put } from '@nestjs/common';
import { ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session.guard';
import {
  ApiError,
  ApiSession,
  INVALID_ID,
  POST_NOT_FOUND,
} from '../common/api-docs';
import { postIdPipe } from '../posts/post-id.pipe';
import { LikeStatusDto } from './dto/like-status.dto';
import { ReactToPostDto } from './dto/react-to-post.dto';
import { LikesService } from './likes.service';

// Rutas bajo /posts/:id, junto a las de PostsController
@ApiTags('likes')
@ApiSession()
@ApiParam({ name: 'id', format: 'uuid', description: 'De la publicación' })
@ApiError(400, 'id no es un UUID', INVALID_ID)
@ApiError(404, 'La publicación no existe o fue eliminada', POST_NOT_FOUND)
@Controller('posts/:id/like')
export class LikesController {
  constructor(private readonly likes: LikesService) {}

  @Put()
  @ApiOkResponse({
    type: LikeStatusDto,
    description:
      'Sin reaction cuenta como Me gusta. Repetirla responde lo mismo y elegir otra la reemplaza sin sumar al total (RN05)',
  })
  @ApiError(400, 'id no es un UUID o la reacción no es válida', INVALID_ID, {
    summary: 'Reacción no válida',
    message: 'reaction: no es una reacción válida',
    details: [{ field: 'reaction', rule: 'isIn' }],
  })
  react(
    @Param('id', postIdPipe) id: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: ReactToPostDto,
  ): Promise<LikeStatusDto> {
    return this.likes.react(id, user.id, dto.reaction);
  }

  @Delete()
  @ApiOkResponse({
    type: LikeStatusDto,
    description: 'Quitar una reacción que no existe responde lo mismo',
  })
  unreact(
    @Param('id', postIdPipe) id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<LikeStatusDto> {
    return this.likes.unreact(id, user.id);
  }
}
