import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { MAX_WATCH_POST_IDS } from './post-watch.dto';

// presence:watch (docs/05-api.md): { userIds: string[] }
export class PresenceWatchDto {
  @IsUUID('all', { each: true })
  @ArrayMaxSize(MAX_WATCH_POST_IDS)
  @ArrayMinSize(1)
  @IsArray()
  userIds!: string[];
}
