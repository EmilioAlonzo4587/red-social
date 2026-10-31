import { Body, Controller, Delete, Param, Put } from '@nestjs/common';
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
import { ReactToPostDto } from './dto/react-to-post.dto';
import { LikesService } from './likes.service';

// Rutas bajo /posts/:id, junto a las de PostsController
@ApiTags('likes')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiBadRequestResponse({
  type: ErrorResponseDto,
  description: 'id no es un UUID o la reacción no es válida',
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
    description:
      'Sin reaction cuenta como Me gusta. Repetirla responde lo mismo y elegir otra la reemplaza sin sumar al total (RN05)',
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
