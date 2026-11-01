import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { MeDto } from '../auth/dto/me.dto';
import type { SessionUser } from '../auth/session.guard';
import {
  ApiError,
  ApiSession,
  unknownField,
  USER_NOT_FOUND,
  USERNAME_PARAM,
} from '../common/api-docs';
import { ProfileDto } from './dto/profile.dto';
import { SearchUsersQueryDto } from './dto/search-users-query.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { UserSummaryDto } from './dto/user-summary.dto';
import { UsersService } from './users.service';

// Las rutas fijas (/users/search de S3-02) van antes de /users/:username para que
// Nest no las tome como un nombre de usuario.
@ApiTags('users')
@ApiSession()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch('me')
  @ApiOkResponse({
    type: MeDto,
    description:
      'Perfil actualizado. Un campo que falta no cambia; null lo borra',
  })
  @ApiError(
    400,
    'displayName pasa de 80, bio de 300, avatarPublicId no es del usuario, o un campo no permitido',
    {
      summary: 'Biografía larga',
      message: 'bio: máximo 300 caracteres',
      details: [{ field: 'bio', rule: 'maxLength' }],
    },
    {
      summary: 'Foto de otro usuario',
      message: 'avatarPublicId: no pertenece al usuario',
      details: [{ field: 'avatarPublicId', rule: 'ownership' }],
    },
    unknownField('username'),
  )
  updateMe(
    @CurrentUser() user: SessionUser,
    @Body() dto: UpdateMeDto,
  ): Promise<MeDto> {
    return this.users.updateMe(user.id, dto);
  }

  @Get('search')
  @ApiOkResponse({
    type: [UserSummaryDto],
    description: 'Máximo 20 (RN14); primero los que empiezan con el texto',
  })
  @ApiError(400, 'q tiene menos de 2 caracteres (RN14)', {
    summary: 'Búsqueda corta (RN14)',
    message: 'q: mínimo 2 caracteres',
    details: [{ field: 'q', rule: 'minLength' }],
  })
  search(@Query() query: SearchUsersQueryDto): Promise<UserSummaryDto[]> {
    return this.users.search(query.q);
  }

  @Get(':username')
  @ApiParam(USERNAME_PARAM)
  @ApiOkResponse({
    type: ProfileDto,
    description: 'Perfil con contadores; sin correo',
  })
  @ApiError(404, 'El usuario no existe', USER_NOT_FOUND)
  profile(
    @Param('username') username: string,
    @CurrentUser() user: SessionUser,
  ): Promise<ProfileDto> {
    return this.users.profile(username, user.id);
  }
}
