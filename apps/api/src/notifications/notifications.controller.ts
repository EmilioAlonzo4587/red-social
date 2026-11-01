import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session.guard';
import { ApiError, ApiSession, INVALID_CURSOR } from '../common/api-docs';
import { CursorQueryDto } from '../common/dto/cursor-query.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import { NotificationPageDto, UnreadCountDto } from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

// Siempre las del usuario de la sesión; nadie ve ni marca las de otro
@ApiTags('notifications')
@ApiSession()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOkResponse({
    type: NotificationPageDto,
    description:
      'De la más reciente a la más antigua; sin las de publicaciones o comentarios eliminados',
  })
  @ApiError(400, 'Cursor no válido', INVALID_CURSOR)
  list(
    @CurrentUser() user: SessionUser,
    @Query() query: CursorQueryDto,
  ): Promise<NotificationPageDto> {
    return this.notifications.list(user.id, query.cursor);
  }

  @Get('unread-count')
  @ApiOkResponse({
    type: UnreadCountDto,
    description: 'Sin leer, contando las mismas que muestra la lista',
  })
  unreadCount(@CurrentUser() user: SessionUser): Promise<UnreadCountDto> {
    return this.notifications.unreadCount(user.id);
  }

  @Post('read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Marcadas como leídas' })
  @ApiError(
    400,
    'Falta ids o all, vienen los dos, all no es true o ids no es una lista de 1 a 100 UUID',
    {
      summary: 'Sin ids ni all',
      message: 'ids: debe ser una lista de ids; all: debe ser true',
      details: [
        { field: 'ids', rule: 'isArray' },
        { field: 'all', rule: 'equals' },
      ],
    },
    {
      summary: 'ids y all juntos',
      message: 'all: no se puede mandar junto con ids',
      details: [{ field: 'all', rule: 'notWith' }],
    },
    {
      summary: 'Una id no es UUID',
      message: 'ids: cada id debe ser un UUID',
      details: [{ field: 'ids', rule: 'isUuid' }],
    },
  )
  markRead(
    @CurrentUser() user: SessionUser,
    @Body() dto: MarkReadDto,
  ): Promise<void> {
    return this.notifications.markRead(user.id, dto);
  }
}
