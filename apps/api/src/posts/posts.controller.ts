import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
  type ErrorExample,
  INVALID_ID,
  POST_NOT_FOUND,
  unknownField,
} from '../common/api-docs';
import { CreatePostDto } from './dto/create-post.dto';
import { PostDto } from './dto/post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { postIdPipe } from './post-id.pipe';
import { PostsService } from './posts.service';

// Sin texto ni imágenes, al crear o al editar (RN03)
const EMPTY_POST: ErrorExample = {
  summary: 'Sin texto ni imágenes (RN03)',
  message: 'content: escribe un texto o agrega al menos una imagen',
  details: [{ field: 'content', rule: 'contentOrMedia' }],
};

const LONG_CONTENT: ErrorExample = {
  summary: 'Texto largo (RN03)',
  message: 'content: máximo 2000 caracteres',
  details: [{ field: 'content', rule: 'maxLength' }],
};

const ID_PARAM = {
  name: 'id',
  format: 'uuid',
  description: 'De la publicación',
};

@ApiTags('posts')
@ApiSession()
@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Post()
  @ApiCreatedResponse({
    type: PostDto,
    description: 'Creada; llega a los seguidores por Socket.io (feed:new)',
  })
  @ApiError(
    400,
    'Sin texto ni imágenes, content pasa de 2000, más de 4 imágenes o una imagen no es del usuario (RN03, RN04)',
    EMPTY_POST,
    LONG_CONTENT,
    {
      summary: 'Más de 4 imágenes (RN03)',
      message: 'media: máximo 4 imágenes',
      details: [{ field: 'media', rule: 'arrayMaxSize' }],
    },
    {
      summary: 'Imagen de otro usuario',
      message: 'media.0.publicId: no pertenece al usuario',
      details: [{ field: 'media.0.publicId', rule: 'ownership' }],
    },
    unknownField('authorId'),
  )
  create(
    @CurrentUser() user: SessionUser,
    @Body() dto: CreatePostDto,
  ): Promise<PostDto> {
    return this.posts.create(user.id, dto);
  }

  @Get(':id')
  @ApiParam(ID_PARAM)
  @ApiOkResponse({
    type: PostDto,
    description: 'La publicación con likedByMe y myReaction de quien la pide',
  })
  @ApiError(400, 'id no es un UUID', INVALID_ID)
  @ApiError(404, 'No existe o fue eliminada', POST_NOT_FOUND)
  findOne(
    @Param('id', postIdPipe) id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<PostDto> {
    return this.posts.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiParam(ID_PARAM)
  @ApiOkResponse({
    type: PostDto,
    description: 'Texto actualizado y editedAt con la hora de la edición',
  })
  @ApiError(
    400,
    'id no es un UUID, content pasa de 2000 o quedaría sin texto ni imágenes (RN03)',
    EMPTY_POST,
    LONG_CONTENT,
    INVALID_ID,
  )
  @ApiError(403, 'La publicación es de otro usuario (RN04)', {
    summary: 'Publicación ajena (RN04)',
    message: 'Solo el autor puede editar su publicación',
  })
  @ApiError(404, 'No existe o fue eliminada', POST_NOT_FOUND)
  update(
    @Param('id', postIdPipe) id: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: UpdatePostDto,
  ): Promise<PostDto> {
    return this.posts.update(id, user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam(ID_PARAM)
  @ApiNoContentResponse({
    description: 'Eliminada (borrado lógico) junto con sus imágenes (RN04)',
  })
  @ApiError(400, 'id no es un UUID', INVALID_ID)
  @ApiError(403, 'La publicación es de otro usuario (RN04)', {
    summary: 'Publicación ajena (RN04)',
    message: 'Solo el autor puede eliminar su publicación',
  })
  @ApiError(404, 'No existe o ya fue eliminada', POST_NOT_FOUND)
  remove(
    @Param('id', postIdPipe) id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<void> {
    return this.posts.remove(id, user.id);
  }
}
