import { IsUUID } from 'class-validator';

// conversation:join (docs/05-api.md): { conversationId: string }
export class ConversationJoinDto {
  @IsUUID('all')
  conversationId!: string;
}
