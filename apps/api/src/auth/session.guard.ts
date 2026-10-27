import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ACCESS_COOKIE } from './cookies';
import { IS_PUBLIC } from './public.decorator';

export interface SessionUser {
  id: string;
}

export interface AuthenticatedRequest extends Request {
  user: SessionUser;
}

interface AccessPayload {
  sub: string;
}

// Guard global (APP_GUARD en AuthModule): corre antes de cada ruta. Si la ruta no es
// @Public(), exige un JWT válido en la cookie access_token y deja req.user = { id }.
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token: unknown = req.cookies?.[ACCESS_COOKIE];
    if (typeof token !== 'string' || !token) {
      throw new UnauthorizedException('Inicia sesión para continuar');
    }

    try {
      // Verifica la firma con JWT_ACCESS_SECRET y que no haya vencido (exp)
      const payload = await this.jwt.verifyAsync<AccessPayload>(token);
      req.user = { id: payload.sub };
      return true;
    } catch {
      throw new UnauthorizedException('Sesión vencida');
    }
  }
}
