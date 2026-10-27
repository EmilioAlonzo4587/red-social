import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auht.module';
import { EnvModule } from './config/env.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [EnvModule, PrismaModule, AuthModule, HealthModule],
})
export class AppModule {}
