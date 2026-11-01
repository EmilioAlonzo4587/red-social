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
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session.guard';
import {
  ApiError,
  ApiSession,
  COMMENT_NOT_FOUND,
  INVALID_CURSOR,
  INVALID_ID,
  POST_NOT_FOUND,
  unknownField,
} from '../common/api-docs';
import { CursorQueryDto } from '../common/dto/cursor-query.dto';
import { postIdPipe } from '../posts/post-id.pipe';
import { CommentsService } from './comments.service';
import { CommentDto, CommentPageDto } from './dto/comment.dto';
import { CreateCommentDto } from './dto/create-comment.dto';

// Listar y crear van bajo /posts/:id/comments; borrar, bajo /comments/:id (docs/05-api.md)
@ApiTags('comments')
@ApiSession()
@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('posts/:id/comments')
  @ApiParam({ name: 'id', format: 'uuid', description: 'De la publicación' })
  @ApiOkResponse({
    type: CommentPageDto,
    description:
      'Solo los de primer nivel, del más antiguo al más reciente, con replyCount',
  })
  @ApiError(
    400,
    'id no es un UUID o cursor no válido',
    INVALID_ID,
    INVALID_CURSOR,
  )
  @ApiError(404, 'La publicación no existe o fue eliminada', POST_NOT_FOUND)
  list(
    @Param('id', postIdPipe) postId: string,
    @Query() query: CursorQueryDto,
  ): Promise<CommentPageDto> {
    return this.comments.list(postId, query.cursor);
  }

  @Get('comments/:id/replies')
  @ApiParam({ name: 'id', format: 'uuid', description: 'Del comentario' })
  @ApiOkResponse({
    type: CommentPageDto,
    description:
      'Respuestas del comentario, de la más antigua a la más reciente (S4-14)',
  })
  @ApiError(
    400,
    'id no es un UUID o cursor no válido',
    INVALID_ID,
    INVALID_CURSOR,
  )
  @ApiError(
    404,
    'El comentario no existe o su publicación fue eliminada',
    COMMENT_NOT_FOUND,
  )
  listReplies(
    @Param('id', postIdPipe) commentId: string,
    @Query() query: CursorQueryDto,
  ): Promise<CommentPageDto> {
    return this.comments.listReplies(commentId, query.cursor);
  }

  @Post('posts/:id/comments')
  @ApiParam({ name: 'id', format: 'uuid', description: 'De la publicación' })
  @ApiCreatedResponse({
    type: CommentDto,
    description: 'Creado; con parentId, como respuesta en ese hilo',
  })
  @ApiError(
    400,
    'content vacío o de más de 1000 caracteres (RN07), id no es un UUID, o parentId no existe, fue eliminado o es de otra publicación (S4-14)',
    {
      summary: 'Comentario vacío (RN07)',
      message: 'content: es obligatorio',
      details: [{ field: 'content', rule: 'isNotEmpty' }],
    },
    {
      summary: 'Comentario largo (RN07)',
      message: 'content: máximo 1000 caracteres',
      details: [{ field: 'content', rule: 'maxLength' }],
    },
    {
      summary: 'parentId no válido (S4-14)',
      message:
        'parentId: el comentario no existe, fue eliminado o es de otra publicación',
      details: [{ field: 'parentId', rule: 'parent' }],
    },
    INVALID_ID,
    unknownField('authorId'),
  )
  @ApiError(404, 'La publicación no existe o fue eliminada', POST_NOT_FOUND)
  create(
    @Param('id', postIdPipe) postId: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: CreateCommentDto,
  ): Promise<CommentDto> {
    return this.comments.create(postId, user.id, dto);
  }

  @Delete('comments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', format: 'uuid', description: 'Del comentario' })
  @ApiNoContentResponse({ description: 'Eliminado' })
  @ApiError(400, 'id no es un UUID', INVALID_ID)
  @ApiError(403, 'El comentario es de otro usuario (RN04)', {
    summary: 'Comentario ajeno (RN04)',
    message: 'Solo el autor puede eliminar su comentario',
  })
  @ApiError(404, 'No existe o ya fue eliminado', COMMENT_NOT_FOUND)
  remove(
    @Param('id', postIdPipe) id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<void> {
    return this.comments.remove(id, user.id);
  }
}
