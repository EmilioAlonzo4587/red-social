import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
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
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session.guard';
import { CursorQueryDto } from '../common/dto/cursor-query.dto';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { postIdPipe as idPipe } from '../posts/post-id.pipe';
import { ConversationsService } from './conversations.service';
import {
  ConversationDto,
  MessageDto,
  MessagePageDto,
} from './dto/conversation.dto';
import { OpenConversationDto } from './dto/open-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';

// Chat 1 a 1 (S3-04, RN09). Los mensajes se envían por HTTP y se distribuyen por Socket.io
// (S3-05) a partir del evento message.created.
@ApiTags('conversations')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Post()
  @ApiCreatedResponse({ type: ConversationDto, description: 'Nueva' })
  @ApiOkResponse({ type: ConversationDto, description: 'Ya existía' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Falta username o es el propio usuario',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'El usuario no existe',
  })
  async open(
    @CurrentUser() user: SessionUser,
    @Body() dto: OpenConversationDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ConversationDto> {
    const { conversation, created } = await this.conversations.open(
      user.id,
      dto.username,
    );
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return conversation;
  }

  @Get()
  @ApiOkResponse({
    type: [ConversationDto],
    description:
      'Solo con mensajes, ordenadas por el último mensaje, máximo 50',
  })
  inbox(@CurrentUser() user: SessionUser): Promise<ConversationDto[]> {
    return this.conversations.inbox(user.id);
  }

  @Get(':id/messages')
  @ApiOkResponse({
    type: MessagePageDto,
    description: 'Del más reciente al más antiguo',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'id no es un UUID o cursor no válido',
  })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'No participa en la conversación (RN09)',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'La conversación no existe',
  })
  messages(
    @Param('id', idPipe) id: string,
    @CurrentUser() user: SessionUser,
    @Query() query: CursorQueryDto,
  ): Promise<MessagePageDto> {
    return this.conversations.messages(id, user.id, query.cursor);
  }

  @Post(':id/messages')
  @ApiCreatedResponse({ type: MessageDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      'content vacío o de más de 2000 caracteres (RN09), o id no es un UUID',
  })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'No participa en la conversación (RN09)',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'La conversación no existe',
  })
  send(
    @Param('id', idPipe) id: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: SendMessageDto,
  ): Promise<MessageDto> {
    return this.conversations.send(id, user.id, dto);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Leída hasta el último mensaje' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'id no es un UUID',
  })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'No participa en la conversación (RN09)',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'La conversación no existe',
  })
  markRead(
    @Param('id', idPipe) id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<void> {
    return this.conversations.markRead(id, user.id);
  }
}
