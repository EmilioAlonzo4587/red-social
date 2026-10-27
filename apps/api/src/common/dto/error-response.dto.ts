import { ApiProperty } from '@nestjs/swagger';

export class ErrorDetailDto {
  @ApiProperty({ example: 'username' })
  field!: string;

  @ApiProperty({ example: 'minLength' })
  rule!: string;
}

// Formato único de error (docs/05-api.md). Lo arma AllExceptionsFilter.
export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'Bad Request' })
  error!: string;

  @ApiProperty({ example: 'username: mínimo 3 caracteres' })
  message!: string;

  @ApiProperty({ type: [ErrorDetailDto] })
  details!: ErrorDetailDto[];
}
