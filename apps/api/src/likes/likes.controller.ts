import { Controller, Delete, Param, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session.guard';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { postIdPipe } from '../posts/post-id.pipe';
import { LikeStatusDto } from './dto/like-status.dto';
import { LikesService } from './likes.service';

// Rutas bajo /posts/:id, junto a las de PostsController
@ApiTags('likes')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiBadRequestResponse({
  type: ErrorResponseDto,
  description: 'id no es un UUID',
})
@ApiNotFoundResponse({
  type: ErrorResponseDto,
  description: 'La publicación no existe o fue eliminada',
})
@Controller('posts/:id/like')
export class LikesController {
  constructor(private readonly likes: LikesService) {}

  @Put()
  @ApiOkResponse({
    type: LikeStatusDto,
    description: 'Repetirlo responde lo mismo y no cuenta otro like (RN05)',
  })
  like(
    @Param('id', postIdPipe) id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<LikeStatusDto> {
    return this.likes.like(id, user.id);
  }

  @Delete()
  @ApiOkResponse({
    type: LikeStatusDto,
    description: 'Quitar un like que no existe responde lo mismo',
  })
  unlike(
    @Param('id', postIdPipe) id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<LikeStatusDto> {
    return this.likes.unlike(id, user.id);
  }
}
