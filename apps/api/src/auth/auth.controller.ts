import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { ENV, type Env } from '../config/env';
import { AuthService } from './auth.service';
import {
  clearSessionCookies,
  REFRESH_COOKIE,
  setSessionCookies,
} from './cookies';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { MeDto } from './dto/me.dto';
import { RegisterDto } from './dto/register.dto';
import { Public } from './public.decorator';
import type { SessionUser } from './session.guard';

function refreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' ? value : undefined;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('register')
  @Public()
  @UseGuards(ThrottlerGuard) // 5 por minuto por IP (RN13), ver AuthModule
  @ApiCreatedResponse({
    type: MeDto,
    description: 'Cuenta creada y sesión iniciada',
  })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'RN01, RN02' })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Usuario o correo ya registrado',
  })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
  async register(
    @Body() dto: RegisterDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeDto> {
    const { me, session } = await this.auth.register(dto, userAgent);
    setSessionCookies(res, this.env, session.accessToken, session.refreshToken);
    return me;
  }

  @Post('login')
  @Public()
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: MeDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Falta un campo',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Usuario o contraseña incorrectos',
  })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeDto> {
    const { me, session } = await this.auth.login(dto, userAgent);
    setSessionCookies(res, this.env, session.accessToken, session.refreshToken);
    return me;
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Cookies nuevas' })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Sin token, vencido o reutilizado (RN12)',
  })
  async refresh(
    @Req() req: Request,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    try {
      const session = await this.auth.refresh(refreshCookie(req), userAgent);
      setSessionCookies(
        res,
        this.env,
        session.accessToken,
        session.refreshToken,
      );
    } catch (error) {
      // Una sesión que no se puede renovar ya no sirve: se borran las cookies
      if (error instanceof UnauthorizedException)
        clearSessionCookies(res, this.env);
      throw error;
    }
  }

  // Pública a propósito: cerrar sesión debe funcionar aunque el token de acceso ya venció
  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Sesión cerrada y cookies borradas' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(refreshCookie(req));
    clearSessionCookies(res, this.env);
  }

  @Get('me')
  @ApiCookieAuth()
  @ApiOkResponse({ type: MeDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  me(@CurrentUser() user: SessionUser): Promise<MeDto> {
    return this.auth.me(user.id);
  }
}
