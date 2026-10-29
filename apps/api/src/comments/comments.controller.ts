import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session.guard';
import { CursorQueryDto } from '../common/dto/cursor-query.dto';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { postIdPipe } from '../posts/post-id.pipe';
import { CommentsService } from './comments.service';
import { CommentDto, CommentPageDto } from './dto/comment.dto';
import { CreateCommentDto } from './dto/create-comment.dto';

// Listar y crear van bajo /posts/:id/comments; borrar, bajo /comments/:id (docs/05-api.md)
@ApiTags('comments')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('posts/:id/comments')
  @ApiOkResponse({
    type: CommentPageDto,
    description: 'Del más antiguo al más reciente',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'id no es un UUID o cursor no válido',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'La publicación no existe o fue eliminada',
  })
  list(
    @Param('id', postIdPipe) postId: string,
    @Query() query: CursorQueryDto,
  ): Promise<CommentPageDto> {
    return this.comments.list(postId, query.cursor);
  }

  @Post('posts/:id/comments')
  @ApiCreatedResponse({ type: CommentDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      'content vacío o de más de 1000 caracteres (RN07), o id no es un UUID',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'La publicación no existe o fue eliminada',
  })
  create(
    @Param('id', postIdPipe) postId: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: CreateCommentDto,
  ): Promise<CommentDto> {
    return this.comments.create(postId, user.id, dto);
  }

  @Delete('comments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Eliminado' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'id no es un UUID',
  })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'El comentario es de otro usuario (RN04)',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'No existe o ya fue eliminado',
  })
  remove(
    @Param('id', postIdPipe) id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<void> {
    return this.comments.remove(id, user.id);
  }
}
