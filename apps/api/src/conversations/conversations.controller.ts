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
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session.guard';
import {
  ApiError,
  ApiSession,
  CONVERSATION_NOT_FOUND,
  INVALID_CURSOR,
  INVALID_ID,
  NOT_A_PARTICIPANT,
  USER_NOT_FOUND,
} from '../common/api-docs';
import { CursorQueryDto } from '../common/dto/cursor-query.dto';
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
@ApiSession()
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Post()
  @ApiCreatedResponse({ type: ConversationDto, description: 'Nueva' })
  @ApiOkResponse({ type: ConversationDto, description: 'Ya existía' })
  @ApiError(
    400,
    'Falta username o es el propio usuario',
    {
      summary: 'Falta username',
      message: 'username: es obligatorio',
      details: [{ field: 'username', rule: 'isNotEmpty' }],
    },
    {
      summary: 'Chat con uno mismo',
      message: 'username: no puedes abrir un chat contigo',
      details: [{ field: 'username', rule: 'notSelf' }],
    },
  )
  @ApiError(404, 'El usuario no existe', USER_NOT_FOUND)
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
  @ApiParam({ name: 'id', format: 'uuid', description: 'De la conversación' })
  @ApiOkResponse({
    type: MessagePageDto,
    description: 'Del más reciente al más antiguo',
  })
  @ApiError(
    400,
    'id no es un UUID o cursor no válido',
    INVALID_ID,
    INVALID_CURSOR,
  )
  @ApiError(403, 'No participa en la conversación (RN09)', NOT_A_PARTICIPANT)
  @ApiError(404, 'La conversación no existe', CONVERSATION_NOT_FOUND)
  messages(
    @Param('id', idPipe) id: string,
    @CurrentUser() user: SessionUser,
    @Query() query: CursorQueryDto,
  ): Promise<MessagePageDto> {
    return this.conversations.messages(id, user.id, query.cursor);
  }

  @Post(':id/messages')
  @ApiParam({ name: 'id', format: 'uuid', description: 'De la conversación' })
  @ApiCreatedResponse({
    type: MessageDto,
    description: 'Enviado; llega a los dos por Socket.io (message:new)',
  })
  @ApiError(
    400,
    'content vacío o de más de 2000 caracteres (RN09), o id no es un UUID',
    {
      summary: 'Mensaje vacío (RN09)',
      message: 'content: es obligatorio',
      details: [{ field: 'content', rule: 'isNotEmpty' }],
    },
    {
      summary: 'Mensaje largo (RN09)',
      message: 'content: máximo 2000 caracteres',
      details: [{ field: 'content', rule: 'maxLength' }],
    },
    INVALID_ID,
  )
  @ApiError(403, 'No participa en la conversación (RN09)', NOT_A_PARTICIPANT)
  @ApiError(404, 'La conversación no existe', CONVERSATION_NOT_FOUND)
  send(
    @Param('id', idPipe) id: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: SendMessageDto,
  ): Promise<MessageDto> {
    return this.conversations.send(id, user.id, dto);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', format: 'uuid', description: 'De la conversación' })
  @ApiNoContentResponse({ description: 'Leída hasta el último mensaje' })
  @ApiError(400, 'id no es un UUID', INVALID_ID)
  @ApiError(403, 'No participa en la conversación (RN09)', NOT_A_PARTICIPANT)
  @ApiError(404, 'La conversación no existe', CONVERSATION_NOT_FOUND)
  markRead(
    @Param('id', idPipe) id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<void> {
    return this.conversations.markRead(id, user.id);
  }
}
