import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { EnvModule } from './config/env.module';
import { EventsModule } from './events/events.module';
import { FollowsModule } from './follows/follows.module';
import { HealthModule } from './health/health.module';
import { MediaModule } from './media/media.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
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
    MediaModule,
    RealtimeModule,
  ],
})
export class AppModule {}
