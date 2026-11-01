import { applyDecorators } from '@nestjs/common';
import {
  ApiCookieAuth,
  type ApiParamOptions,
  ApiResponse,
} from '@nestjs/swagger';
import { STATUS_CODES } from 'node:http';
import { ErrorDetailDto, ErrorResponseDto } from './dto/error-response.dto';

// Nombres de los esquemas de seguridad de Swagger (los registra createSwaggerDocument)
export const ACCESS_COOKIE_AUTH = 'access_token';
export const REFRESH_COOKIE_AUTH = 'refresh_token';

export interface ErrorExample {
  // Título del ejemplo en el desplegable de Swagger
  summary: string;
  message: string;
  details?: ErrorDetailDto[];
}

// Un error documentado en Swagger con el formato único de docs/05-api.md y uno o más
// ejemplos reales: el mismo message y details que arma AllExceptionsFilter.
export function ApiError(
  status: number,
  description: string,
  ...examples: ErrorExample[]
): MethodDecorator & ClassDecorator {
  return ApiResponse({
    status,
    type: ErrorResponseDto,
    description,
    examples: Object.fromEntries(
      examples.map(({ summary, message, details = [] }) => [
        summary,
        {
          summary,
          value: {
            statusCode: status,
            error: STATUS_CODES[status] ?? 'Error',
            message,
            details,
          },
        },
      ]),
    ),
  });
}

// Ruta con sesión: pide la cookie access_token y documenta su 401
export function ApiSession(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiCookieAuth(ACCESS_COOKIE_AUTH),
    ApiError(
      401,
      'Sin la cookie access_token o con el JWT vencido: la web llama una vez a POST /api/auth/refresh y repite la petición',
      { summary: 'Sin sesión', message: 'Inicia sesión para continuar' },
      { summary: 'Sesión vencida', message: 'Sesión vencida' },
    ),
  );
}

// :username de las rutas /users/:username/...
export const USERNAME_PARAM: ApiParamOptions = {
  name: 'username',
  example: 'ana_lopez',
  description: 'Sin distinguir mayúsculas',
};

// Ejemplos que se repiten en varias rutas
export const INVALID_ID: ErrorExample = {
  summary: 'id no es un UUID',
  message: 'id: debe ser un UUID',
  details: [{ field: 'id', rule: 'isUuid' }],
};

export const INVALID_CURSOR: ErrorExample = {
  summary: 'Cursor no válido',
  message: 'cursor: no es válido',
  details: [{ field: 'cursor', rule: 'cursor' }],
};

// Un campo que el DTO no declara (forbidNonWhitelisted del ValidationPipe global)
export function unknownField(field: string): ErrorExample {
  return {
    summary: 'Campo no permitido',
    message: `${field}: campo no permitido`,
    details: [{ field, rule: 'whitelistValidation' }],
  };
}

export const POST_NOT_FOUND: ErrorExample = {
  summary: 'Publicación inexistente o eliminada',
  message: 'Publicación no encontrada',
};

export const USER_NOT_FOUND: ErrorExample = {
  summary: 'Usuario inexistente',
  message: 'Usuario no encontrado',
};

export const COMMENT_NOT_FOUND: ErrorExample = {
  summary: 'Comentario inexistente o eliminado',
  message: 'Comentario no encontrado',
};

export const CONVERSATION_NOT_FOUND: ErrorExample = {
  summary: 'Conversación inexistente',
  message: 'Conversación no encontrada',
};

export const NOT_A_PARTICIPANT: ErrorExample = {
  summary: 'No participa (RN09)',
  message: 'No participas en esta conversación',
};
