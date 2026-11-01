import { Controller, Get, Param, Query } from '@nestjs/common';
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
import { PostPageDto } from './dto/post-page.dto';
import { FeedService } from './feed.service';

// Listas de publicaciones (S2-05). /users/:username/posts vive aquí y no en UsersController,
// igual que followers y following en FollowsController.
@ApiTags('feed')
@ApiSession()
@ApiError(400, 'Cursor no válido', INVALID_CURSOR)
@Controller()
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Get('feed')
  @ApiOkResponse({
    type: PostPageDto,
    description: 'Siguiendo: propias y de seguidos, más recientes primero',
  })
  following(
    @CurrentUser() user: SessionUser,
    @Query() query: CursorQueryDto,
  ): Promise<PostPageDto> {
    return this.feed.following(user.id, query.cursor);
  }

  @Get('feed/explore')
  @ApiOkResponse({
    type: PostPageDto,
    description: 'Explorar: todas, más recientes primero',
  })
  explore(
    @CurrentUser() user: SessionUser,
    @Query() query: CursorQueryDto,
  ): Promise<PostPageDto> {
    return this.feed.explore(user.id, query.cursor);
  }

  @Get('users/:username/posts')
  @ApiParam(USERNAME_PARAM)
  @ApiOkResponse({
    type: PostPageDto,
    description: 'Publicaciones del usuario, más recientes primero',
  })
  @ApiError(404, 'El usuario no existe', USER_NOT_FOUND)
  byUser(
    @Param('username') username: string,
    @CurrentUser() user: SessionUser,
    @Query() query: CursorQueryDto,
  ): Promise<PostPageDto> {
    return this.feed.byUser(username, user.id, query.cursor);
  }
}
