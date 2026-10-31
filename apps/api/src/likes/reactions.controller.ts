import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { postIdPipe } from '../posts/post-id.pipe';
import { RecentReactionsDto } from './dto/recent-reactions.dto';
import { LikesService } from './likes.service';

// Quién reaccionó a una publicación (S4-16). Va aparte de LikesController porque su ruta
// es /posts/:id/reactions, no /posts/:id/like.
@ApiTags('likes')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller('posts/:id/reactions')
export class ReactionsController {
  constructor(private readonly likes: LikesService) {}

  @Get()
  @ApiOkResponse({
    type: RecentReactionsDto,
    description:
      'Las 5 reacciones más recientes, de la más reciente a la más antigua, y el total',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'id no es un UUID',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'La publicación no existe o fue eliminada',
  })
  recent(@Param('id', postIdPipe) id: string): Promise<RecentReactionsDto> {
    return this.likes.recent(id);
  }
}
