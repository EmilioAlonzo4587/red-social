import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

// Lo que interesa del token de acceso: de quién es y cuándo vence
export interface SessionClaims {
  userId: string;
  /** Vencimiento del JWT en milisegundos desde 1970 (exp * 1000). */
  expiresAt: number;
}

interface AccessPayload {
  sub: string;
  exp: number;
}

// Una sola regla para validar la sesión: la usan SessionGuard (HTTP) y RealtimeGateway (Socket.io)
@Injectable()
export class SessionTokenService {
  constructor(private readonly jwt: JwtService) {}

  // null si falta el token, si la firma no coincide o si ya venció
  async verify(token: unknown): Promise<SessionClaims | null> {
    if (typeof token !== 'string' || !token) return null;
    try {
      // Verifica la firma con JWT_ACCESS_SECRET y que no haya vencido (exp)
      const payload = await this.jwt.verifyAsync<AccessPayload>(token);
      return { userId: payload.sub, expiresAt: payload.exp * 1000 };
    } catch {
      return null;
    }
  }
}
