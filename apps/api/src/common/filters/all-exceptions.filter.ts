import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { ErrorDetailDto, ErrorResponseDto } from '../dto/error-response.dto';

// Atrapa cualquier error que salga de un controlador y responde siempre con el formato
// de docs/05-api.md: { statusCode, error, message, details }. Lo que no es un error
// conocido se registra en el log del servidor y el cliente solo ve un 500 genérico.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);
    res.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ErrorResponseDto {
    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // P2002: violación de una restricción única (usuario o correo repetido)
      if (exception.code === 'P2002') {
        const target = exception.meta?.target;
        const fields = Array.isArray(target)
          ? target.filter((f): f is string => typeof f === 'string')
          : [];
        return build(
          HttpStatus.CONFLICT,
          fields.length
            ? fields.map((f) => `${f}: ya está en uso`).join('; ')
            : 'Ya existe un registro con esos datos',
          fields.map((field) => ({ field, rule: 'unique' })),
        );
      }
      // P2025: el registro que se quería leer, cambiar o borrar no existe
      if (exception.code === 'P2025') {
        return build(HttpStatus.NOT_FOUND, 'No encontrado');
      }
    }

    // Errores de Express con código 4xx, por ejemplo un JSON mal formado (body-parser)
    const status = statusOf(exception);
    if (status && status >= 400 && status < 500) {
      return build(status, STATUS_CODES[status] ?? 'Error');
    }

    this.logger.error(
      exception instanceof Error
        ? (exception.stack ?? exception.message)
        : exception,
    );
    return build(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'Error interno del servidor',
    );
  }

  private fromHttpException(exception: HttpException): ErrorResponseDto {
    const status = exception.getStatus();
    const response = exception.getResponse();
    if (typeof response === 'string') {
      return build(status, response);
    }
    // createValidationPipe() manda { message, details }; las excepciones de Nest
    // mandan { message, error, statusCode } y a veces message es un arreglo
    const { message, details } = response as {
      message?: unknown;
      details?: unknown;
    };
    const text = Array.isArray(message)
      ? message.join('; ')
      : typeof message === 'string'
        ? message
        : exception.message;
    return build(
      status,
      text,
      Array.isArray(details) ? (details as ErrorDetailDto[]) : [],
    );
  }
}

function build(
  statusCode: number,
  message: string,
  details: ErrorDetailDto[] = [],
): ErrorResponseDto {
  return {
    statusCode,
    error: STATUS_CODES[statusCode] ?? 'Error',
    message,
    details,
  };
}

function statusOf(exception: unknown): number | undefined {
  if (typeof exception === 'object' && exception !== null) {
    const { status } = exception as { status?: unknown };
    if (typeof status === 'number') return status;
  }
  return undefined;
}
