import {
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';

interface Detail {
  field: string;
  rule: string;
  message: string;
}

// class-validator devuelve un árbol (los objetos anidados traen "children").
// Se aplana en un elemento por campo, con su primera regla incumplida.
function flatten(errors: ValidationError[], parent = ''): Detail[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const [rule, text] = Object.entries(error.constraints ?? {})[0] ?? [];
    const own: Detail[] = rule
      ? [
          {
            field,
            rule,
            // forbidNonWhitelisted trae su mensaje en inglés: se reemplaza
            message:
              rule === 'whitelistValidation' ? 'campo no permitido' : text,
          },
        ]
      : [];
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

// ValidationPipe global (docs/07-seguridad.md):
// - whitelist: quita del body lo que el DTO no declara.
// - forbidNonWhitelisted: en vez de quitarlo en silencio, responde 400.
// - transform: convierte el JSON en una instancia del DTO (así corren los @Transform).
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => {
      const details = flatten(errors);
      return new BadRequestException({
        message: details.map((d) => `${d.field}: ${d.message}`).join('; '),
        details: details.map(({ field, rule }) => ({ field, rule })),
      });
    },
  });
}
