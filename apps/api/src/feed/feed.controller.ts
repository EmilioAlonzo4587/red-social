import { Controller, Get, Param, Query } from '@nestjs/common';
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
import { PostPageDto } from './dto/post-page.dto';
import { FeedService } from './feed.service';

// Listas de publicaciones (S2-05). /users/:username/posts vive aquí y no en UsersController,
// igual que followers y following en FollowsController.
@ApiTags('feed')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiBadRequestResponse({
  type: ErrorResponseDto,
  description: 'Cursor no válido',
})
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
  @ApiOkResponse({
    type: PostPageDto,
    description: 'Publicaciones del usuario, más recientes primero',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'El usuario no existe',
  })
  byUser(
    @Param('username') username: string,
    @CurrentUser() user: SessionUser,
    @Query() query: CursorQueryDto,
  ): Promise<PostPageDto> {
    return this.feed.byUser(username, user.id, query.cursor);
  }
}
