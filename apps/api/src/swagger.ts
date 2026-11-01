import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';
import { ACCESS_COOKIE_AUTH, REFRESH_COOKIE_AUTH } from './common/api-docs';

// Se lee en /api/docs, arriba de la lista de rutas
const DESCRIPTION = `
API de ChatInit. El contrato completo está en \`docs/05-api.md\`; este documento debe coincidir con él.

## Autenticación por cookie

La sesión viaja en dos cookies \`HttpOnly\` (el JavaScript del navegador no puede leerlas), \`SameSite=Lax\` y, en producción, \`Secure\`:

- **access_token**: JWT que vence a los 15 minutos (\`JWT_ACCESS_TTL\`). Viaja a todo el sitio (\`Path=/\`) y la exigen las rutas con candado.
- **refresh_token**: valor aleatorio que solo viaja a \`/api/auth\` (\`Path=/api/auth\`). \`POST /api/auth/refresh\` lo cambia por uno nuevo cada vez (RN12).

Las dos cookies duran 7 días (\`REFRESH_TOKEN_TTL_DAYS\`). Cuando una ruta con candado responde 401, la web llama una vez a \`POST /api/auth/refresh\` y repite la petición; si \`refresh\` también responde 401, la sesión terminó.

**Para probar desde esta página:** ejecuta \`POST /api/auth/login\` (o \`register\`) con *Try it out*. El navegador guarda las cookies y las manda solo en las peticiones siguientes, porque esta página se sirve en el mismo dominio que la api. El botón *Authorize* no hace falta: un navegador no deja que una página escriba cookies \`HttpOnly\`. Para cerrar la sesión, \`POST /api/auth/logout\`.

## Errores

Todos los errores tienen el mismo formato: \`{ statusCode, error, message, details }\`. En un 400, \`details\` lleva un elemento \`{ field, rule }\` por campo inválido; en los demás es \`[]\`. Cada ruta muestra ejemplos reales de sus errores.

## Listas

Las listas paginadas responden \`{ items, nextCursor }\` de 20 en 20. La página siguiente se pide con \`?cursor=<nextCursor>\` tal cual; \`nextCursor\` es \`null\` en la última.
`.trim();

export function createSwaggerDocument(
  app: NestExpressApplication,
): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('ChatInit API')
    .setVersion('0')
    .setDescription(DESCRIPTION)
    .addCookieAuth(
      'access_token',
      {
        type: 'apiKey',
        description:
          'JWT de 15 minutos. Lo ponen register, login y refresh; viaja a todo el sitio.',
      },
      ACCESS_COOKIE_AUTH,
    )
    .addCookieAuth(
      'refresh_token',
      {
        type: 'apiKey',
        description:
          'Token de un solo uso para renovar la sesión. Solo viaja a /api/auth.',
      },
      REFRESH_COOKIE_AUTH,
    )
    .addTag('auth', 'Registro, inicio y cierre de sesión (S1-02)')
    .addTag('users', 'Perfil y búsqueda de usuarios')
    .addTag('follows', 'Seguir y listas de seguidores y seguidos')
    .addTag('posts', 'Publicaciones')
    .addTag('feed', 'Listas de publicaciones')
    .addTag('likes', 'Reacciones a publicaciones')
    .addTag('comments', 'Comentarios y respuestas')
    .addTag('notifications', 'Notificaciones persistidas')
    .addTag('conversations', 'Chat 1 a 1')
    .addTag('media', 'Subida de imágenes a Cloudinary')
    .addTag('health', 'Estado de la api y la base')
    .build();
  return SwaggerModule.createDocument(app, config);
}

// /api/docs (la página) y /api/docs-json (el JSON que genera packages/api-types)
export function setupSwagger(app: NestExpressApplication): void {
  SwaggerModule.setup('api/docs', app, createSwaggerDocument(app), {
    jsonDocumentUrl: 'api/docs-json',
  });
}
