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
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  type ApiResponseOptions,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  ApiError,
  ApiSession,
  REFRESH_COOKIE_AUTH,
  type ErrorExample,
} from '../common/api-docs';
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

// Lo que register, login y refresh mandan en Set-Cookie (ver cookies.ts)
const SET_SESSION_COOKIES: ApiResponseOptions['headers'] = {
  'Set-Cookie': {
    description:
      'access_token=<JWT>; Path=/; HttpOnly; SameSite=Lax y refresh_token=<token>; Path=/api/auth; HttpOnly; SameSite=Lax, los dos con Max-Age de 7 días (y Secure en producción)',
    schema: { type: 'string' },
  },
};

// 5 intentos por minuto por IP en register y login (RN13). El mensaje es el de @nestjs/throttler.
const TOO_MANY_ATTEMPTS: ErrorExample = {
  summary: 'Sexto intento en un minuto (RN13)',
  message: 'ThrottlerException: Too Many Requests',
};

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
    headers: SET_SESSION_COOKIES,
  })
  @ApiError(
    400,
    'username de 3 a 30 caracteres [A-Za-z0-9_], email válido y password de 8 a 128 (RN01, RN02)',
    {
      summary: 'username corto',
      message: 'username: mínimo 3 caracteres',
      details: [{ field: 'username', rule: 'minLength' }],
    },
    {
      summary: 'Correo no válido',
      message: 'email: correo no válido',
      details: [{ field: 'email', rule: 'isEmail' }],
    },
    {
      summary: 'Contraseña corta (RN02)',
      message: 'password: mínimo 8 caracteres',
      details: [{ field: 'password', rule: 'minLength' }],
    },
  )
  @ApiError(
    409,
    'Usuario o correo ya registrado, sin distinguir mayúsculas (RN01)',
    {
      summary: 'Usuario repetido',
      message: 'username: ya está en uso',
      details: [{ field: 'username', rule: 'unique' }],
    },
    {
      summary: 'Correo repetido',
      message: 'email: ya está en uso',
      details: [{ field: 'email', rule: 'unique' }],
    },
  )
  @ApiError(429, 'Demasiados intentos desde la misma IP', TOO_MANY_ATTEMPTS)
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
  @ApiOkResponse({
    type: MeDto,
    description: 'Sesión iniciada',
    headers: SET_SESSION_COOKIES,
  })
  @ApiError(400, 'Falta un campo o viene vacío', {
    summary: 'password vacío',
    message: 'password: es obligatorio',
    details: [{ field: 'password', rule: 'isNotEmpty' }],
  })
  @ApiError(
    401,
    'Usuario o contraseña incorrectos: el mismo error si la cuenta no existe, para no revelar cuáles existen',
    {
      summary: 'Credenciales incorrectas',
      message: 'Usuario o contraseña incorrectos',
    },
  )
  @ApiError(429, 'Demasiados intentos desde la misma IP', TOO_MANY_ATTEMPTS)
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
  @ApiCookieAuth(REFRESH_COOKIE_AUTH)
  @ApiNoContentResponse({
    description:
      'Cookies nuevas: el refresh_token usado ya no sirve (rotación, RN12)',
    headers: SET_SESSION_COOKIES,
  })
  @ApiError(
    401,
    'Sin refresh_token, vencido o reutilizado. Reutilizar uno ya rotado cierra todas las sesiones del usuario (RN12). Siempre borra las dos cookies',
    { summary: 'No se puede renovar', message: 'Sesión vencida' },
  )
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
  @ApiCookieAuth(REFRESH_COOKIE_AUTH)
  @ApiNoContentResponse({
    description:
      'Sesión cerrada y cookies borradas; responde igual aunque no haya sesión',
    headers: {
      'Set-Cookie': {
        description: 'access_token y refresh_token vacías y ya vencidas',
        schema: { type: 'string' },
      },
    },
  })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(refreshCookie(req));
    clearSessionCookies(res, this.env);
  }

  @Get('me')
  @ApiSession()
  @ApiOkResponse({ type: MeDto, description: 'El usuario con sesión' })
  me(@CurrentUser() user: SessionUser): Promise<MeDto> {
    return this.auth.me(user.id);
  }
}
