import { ApiProperty } from '@nestjs/swagger';
import { UserSummaryDto } from '../../users/dto/user-summary.dto';

// Objeto Message de docs/05-api.md. La web decide si la burbuja es propia comparando
// senderId con el id de Me.
export class MessageDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  conversationId!: string;

  @ApiProperty({ format: 'uuid' })
  senderId!: string;

  @ApiProperty({ example: 'Hola, ¿cómo vas?' })
  content!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

// Page<Message> de docs/05-api.md: del más reciente al más antiguo
export class MessagePageDto {
  @ApiProperty({ type: [MessageDto] })
  items!: MessageDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Se manda como ?cursor= para la siguiente página; null en la última',
  })
  nextCursor!: string | null;
}

// Objeto Conversation de docs/05-api.md: una fila de la bandeja, vista por el usuario con sesión
export class ConversationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: UserSummaryDto, description: 'La otra persona' })
  otherUser!: UserSummaryDto;

  @ApiProperty({
    type: MessageDto,
    nullable: true,
    description: 'null si todavía no hay mensajes',
  })
  lastMessage!: MessageDto | null;

  @ApiProperty({
    example: 2,
    description: 'Mensajes del otro posteriores a mi última lectura',
  })
  unread!: number;
}
