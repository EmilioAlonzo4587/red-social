import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auht.module';
import { EnvModule } from './config/env.module';
import { EventsModule } from './events/events.module';
import { FollowsModule } from './follows/follows.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    EnvModule,
    PrismaModule,
    EventsModule,
    AuthModule,
    HealthModule,
    UsersModule,
    FollowsModule,
  ],
})
export class AppModule {}
