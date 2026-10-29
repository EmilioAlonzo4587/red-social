import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';

// Un :id de publicación que no es UUID responde 400 con el formato de error de
// docs/05-api.md. Lo usan las rutas de posts y de likes.
export const postIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException({
      message: 'id: debe ser un UUID',
      details: [{ field: 'id', rule: 'isUuid' }],
    }),
});
