import { Controller, Delete, Get, Param, Put, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session.guard';
import { CursorQueryDto } from '../common/dto/cursor-query.dto';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { FollowStatusDto } from './dto/follow-status.dto';
import { UserSummaryPageDto } from './dto/user-summary-page.dto';
import { FollowsService } from './follows.service';

// Rutas bajo /users/:username, junto a las de UsersController
@ApiTags('follows')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiNotFoundResponse({
  type: ErrorResponseDto,
  description: 'El usuario no existe',
})
@Controller('users/:username')
export class FollowsController {
  constructor(private readonly follows: FollowsService) {}

  @Put('follow')
  @ApiOkResponse({ type: FollowStatusDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Seguirse a uno mismo (RN06)',
  })
  follow(
    @Param('username') username: string,
    @CurrentUser() user: SessionUser,
  ): Promise<FollowStatusDto> {
    return this.follows.follow(username, user.id);
  }

  @Delete('follow')
  @ApiOkResponse({ type: FollowStatusDto })
  unfollow(
    @Param('username') username: string,
    @CurrentUser() user: SessionUser,
  ): Promise<FollowStatusDto> {
    return this.follows.unfollow(username, user.id);
  }

  @Get('followers')
  @ApiOkResponse({ type: UserSummaryPageDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Cursor no válido',
  })
  followers(
    @Param('username') username: string,
    @Query() query: CursorQueryDto,
  ): Promise<UserSummaryPageDto> {
    return this.follows.list(username, 'followers', query.cursor);
  }

  @Get('following')
  @ApiOkResponse({ type: UserSummaryPageDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Cursor no válido',
  })
  following(
    @Param('username') username: string,
    @Query() query: CursorQueryDto,
  ): Promise<UserSummaryPageDto> {
    return this.follows.list(username, 'following', query.cursor);
  }
}
