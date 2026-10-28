import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { MeDto } from '../auth/dto/me.dto';
import type { SessionUser } from '../auth/session.guard';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { ProfileDto } from './dto/profile.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { UsersService } from './users.service';

// Las rutas fijas (/users/search de S3-02) van antes de /users/:username para que
// Nest no las tome como un nombre de usuario.
@ApiTags('users')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch('me')
  @ApiOkResponse({ type: MeDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'displayName pasa de 80, bio de 300 o un campo no permitido',
  })
  updateMe(
    @CurrentUser() user: SessionUser,
    @Body() dto: UpdateMeDto,
  ): Promise<MeDto> {
    return this.users.updateMe(user.id, dto);
  }

  @Get(':username')
  @ApiOkResponse({ type: ProfileDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  profile(
    @Param('username') username: string,
    @CurrentUser() user: SessionUser,
  ): Promise<ProfileDto> {
    return this.users.profile(username, user.id);
  }
}
