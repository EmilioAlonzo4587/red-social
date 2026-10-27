import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest, SessionUser } from './session.guard';

// En un controlador: me(@CurrentUser() user: SessionUser). Solo en rutas con sesión.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionUser =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
