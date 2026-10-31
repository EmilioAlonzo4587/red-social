import { Module } from '@nestjs/common';
import { LikesController } from './likes.controller';
import { LikesService } from './likes.service';
import { ReactionsController } from './reactions.controller';

@Module({
  controllers: [LikesController, ReactionsController],
  providers: [LikesService],
})
export class LikesModule {}
