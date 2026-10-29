import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
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
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { CreatePostDto } from './dto/create-post.dto';
import { PostDto } from './dto/post.dto';
import { postIdPipe } from './post-id.pipe';
import { PostsService } from './posts.service';

@ApiTags('posts')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Post()
  @ApiCreatedResponse({ type: PostDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      'Sin texto ni imágenes, content pasa de 2000, más de 4 imágenes o una imagen no es del usuario (RN03, RN04)',
  })
  create(
    @CurrentUser() user: SessionUser,
    @Body() dto: CreatePostDto,
  ): Promise<PostDto> {
    return this.posts.create(user.id, dto);
  }

  @Get(':id')
  @ApiOkResponse({ type: PostDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'id no es un UUID',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'No existe o fue eliminada',
  })
  findOne(
    @Param('id', postIdPipe) id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<PostDto> {
    return this.posts.findOne(id, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Eliminada' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'id no es un UUID',
  })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'La publicación es de otro usuario (RN04)',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'No existe o ya fue eliminada',
  })
  remove(
    @Param('id', postIdPipe) id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<void> {
    return this.posts.remove(id, user.id);
  }
}
