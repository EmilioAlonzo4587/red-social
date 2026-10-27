import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { ENV, type Env } from '../config/env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionGuard } from './session.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        secret: env.jwtAccessSecret,
        signOptions: { algorithm: 'HS256', expiresIn: env.jwtAccessTtlSeconds },
        // Solo HS256: rechaza tokens que digan venir firmados con otro algoritmo
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
    // Límite que usa ThrottlerGuard en register y login: 5 por minuto por IP (RN13).
    // Se guarda en memoria: alcanza con una sola instancia de la api.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 5 }],
      errorMessage: 'Demasiados intentos; espera un minuto',
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // Guard global: toda ruta exige sesión salvo las marcadas con @Public()
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
})
export class AuthModule {}
