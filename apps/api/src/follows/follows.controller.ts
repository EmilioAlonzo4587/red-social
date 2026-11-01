import { Controller, Delete, Get, Param, Put, Query } from '@nestjs/common';
import { ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session.guard';
import {
  ApiError,
  ApiSession,
  INVALID_CURSOR,
  USER_NOT_FOUND,
  USERNAME_PARAM,
} from '../common/api-docs';
import { CursorQueryDto } from '../common/dto/cursor-query.dto';
import { FollowStatusDto } from './dto/follow-status.dto';
import { UserSummaryPageDto } from './dto/user-summary-page.dto';
import { FollowsService } from './follows.service';

// Rutas bajo /users/:username, junto a las de UsersController
@ApiTags('follows')
@ApiSession()
@ApiParam(USERNAME_PARAM)
@ApiError(404, 'El usuario no existe', USER_NOT_FOUND)
@Controller('users/:username')
export class FollowsController {
  constructor(private readonly follows: FollowsService) {}

  @Put('follow')
  @ApiOkResponse({
    type: FollowStatusDto,
    description: 'Siguiendo; repetirlo responde lo mismo (RN06)',
  })
  @ApiError(400, 'Seguirse a uno mismo (RN06)', {
    summary: 'Seguirse a uno mismo (RN06)',
    message: 'No puedes seguirte a ti mismo',
  })
  follow(
    @Param('username') username: string,
    @CurrentUser() user: SessionUser,
  ): Promise<FollowStatusDto> {
    return this.follows.follow(username, user.id);
  }

  @Delete('follow')
  @ApiOkResponse({
    type: FollowStatusDto,
    description: 'Dejó de seguir; si no lo seguía responde lo mismo',
  })
  unfollow(
    @Param('username') username: string,
    @CurrentUser() user: SessionUser,
  ): Promise<FollowStatusDto> {
    return this.follows.unfollow(username, user.id);
  }

  @Get('followers')
  @ApiOkResponse({
    type: UserSummaryPageDto,
    description: 'Seguidores, los más recientes primero',
  })
  @ApiError(400, 'Cursor no válido', INVALID_CURSOR)
  followers(
    @Param('username') username: string,
    @Query() query: CursorQueryDto,
  ): Promise<UserSummaryPageDto> {
    return this.follows.list(username, 'followers', query.cursor);
  }

  @Get('following')
  @ApiOkResponse({
    type: UserSummaryPageDto,
    description: 'Seguidos, los más recientes primero',
  })
  @ApiError(400, 'Cursor no válido', INVALID_CURSOR)
  following(
    @Param('username') username: string,
    @Query() query: CursorQueryDto,
  ): Promise<UserSummaryPageDto> {
    return this.follows.list(username, 'following', query.cursor);
  }
}
