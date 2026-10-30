import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session.guard';
import { CursorQueryDto } from '../common/dto/cursor-query.dto';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import { NotificationPageDto, UnreadCountDto } from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

// Siempre las del usuario de la sesión; nadie ve ni marca las de otro
@ApiTags('notifications')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOkResponse({
    type: NotificationPageDto,
    description:
      'De la más reciente a la más antigua; sin las de publicaciones o comentarios eliminados',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'cursor no válido',
  })
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
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      'Falta ids o all, vienen los dos, all no es true o ids no es una lista de 1 a 100 UUID',
  })
  markRead(
    @CurrentUser() user: SessionUser,
    @Body() dto: MarkReadDto,
  ): Promise<void> {
    return this.notifications.markRead(user.id, dto);
  }
}
