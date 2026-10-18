---
name: backend-api
description: Reglas para trabajar en apps/api (NestJS, Prisma y PostgreSQL) en módulos de datos y contenido: usuarios, perfiles, publicaciones, feed, seguimientos, likes, comentarios, búsqueda y notificaciones. Úsala al crear o cambiar endpoints, DTOs, servicios, el esquema de Prisma, migraciones o pruebas de la api.
---

# Backend: datos y contenido (Dev 2)

Lee primero `CLAUDE.md` en la raíz. Esta skill agrega las reglas de `apps/api`.

## Estado actual

`apps/api/src` es el esqueleto de Nest: `AppController` con `GET /` que devuelve "Hello World!", su prueba unitaria y una e2e. Dependencias instaladas: `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `rxjs`, `reflect-metadata`. `prisma/schema.prisma` ya tiene el modelo completo, pero Prisma todavía no está instalado (S0-04).

Si la tarea necesita algo que aún no existe (Prisma, `class-validator`, el prefijo `/api`, el `ValidationPipe` global, el filtro de errores), dilo y créalo como parte de la issue que lo pide, sin adelantarte a otras.

## Estructura

- Un módulo por área en `src/<area>/`: `users`, `posts`, `feed`, `follows`, `likes`, `comments`, `search`, `notifications`. Cada uno con `<area>.module.ts`, `<area>.controller.ts`, `<area>.service.ts`, `dto/` y sus `*.spec.ts`.
- El controlador solo recibe, valida con DTOs y llama al servicio. La lógica y el acceso a datos van en el servicio.
- Los módulos no se importan entre sí para avisarse cosas. Un like, un comentario o un seguimiento emite un evento de dominio con `@nestjs/event-emitter` y notificaciones o Socket.io lo escuchan (D08). Los nombres son los de S1-07 y `docs/03-arquitectura.md`: `like.changed`, `comment.changed`, `follow.created`, `message.created` y `notification.created`; no inventes otros sin agregarlos ahí. Así Dev 2 y Dev 3 no se bloquean.
- Estilo del repo: Prettier con comillas simples y coma final; ESLint `recommendedTypeChecked`. Corre `pnpm --filter api lint` y `pnpm --filter api typecheck` antes de terminar.

## Contrato de la API (docs/05-api.md)

- Rutas bajo `/api`, JSON en camelCase. Rutas, métodos y códigos tal como están en la tabla de endpoints; si necesitas cambiar uno, actualiza `docs/05-api.md` en el mismo PR.
- Seguir y dar like son `PUT` (idempotentes) y deshacer es `DELETE`. Repetir un `PUT` no crea otra fila ni cambia el contador (RN05, RN06).
- Listas con paginación por cursor: respuesta `{ items, nextCursor }`, tamaño fijo 20, siguiente página con `?cursor=`. Ordena por `createdAt` e `id` descendentes y usa ese par como cursor; nunca `offset`.
- Errores siempre con el formato único:

```json
{ "statusCode": 400, "error": "Bad Request", "message": "content: máximo 2000 caracteres", "details": [ { "field": "content", "rule": "maxLength" } ] }
```

- Códigos: 400 validación, 401 sin sesión, 403 sin permiso sobre algo ajeno, 404 inexistente o borrado, 409 usuario o correo repetido, 413 archivo grande, 429 demasiados intentos. Usa las excepciones de Nest (`NotFoundException`, `ForbiddenException`, `ConflictException`) y no armes respuestas de error a mano en cada controlador.
- Cada endpoint se documenta en Swagger con sus respuestas de error (definición de terminado).

## Validación de entradas

- Toda entrada pasa por un DTO con `class-validator`: body, params y query. El `ValidationPipe` global usa `whitelist`, `forbidNonWhitelisted` y `transform`, así que un campo que no está en el DTO se rechaza con 400.
- Los límites del DTO son los mismos que los de la base y las reglas de negocio:

| Campo | Regla |
|---|---|
| `username` | 3 a 30, solo `[A-Za-z0-9_]`, único sin distinguir mayúsculas (RN01) |
| `email` | formato de correo, único sin distinguir mayúsculas (RN01) |
| `password` | mínimo 8 (RN02) |
| `displayName` | máximo 80 |
| `bio` | máximo 300 |
| `post.content` | máximo 2000; puede faltar si hay imágenes, pero no ambos vacíos; máximo 4 imágenes (RN03) |
| `comment.content` | 1 a 1000 tras recortar espacios (RN07) |
| búsqueda `q` | mínimo 2 caracteres |
| ids | `ParseUUIDPipe` |

- Recorta espacios (`trim`) en textos antes de validar longitudes. No conviertas ni "limpies" HTML: el texto se guarda tal cual y React lo escapa al mostrarlo.
- No confíes en ids de autor que vengan del cliente: el autor siempre es el usuario de la sesión.

## Acceso a datos

- Todo por Prisma. Si hace falta SQL a mano (búsqueda con `pg_trgm`), usa `$queryRaw` con plantilla etiquetada; nunca `$queryRawUnsafe` ni concatenación de strings.
- El esquema vive en `apps/api/prisma/schema.prisma`. Los CHECK, índices parciales (`WHERE deleted_at IS NULL`) y extensiones (`citext`, `pg_trgm`) van como SQL manual en la migración (`prisma migrate dev --create-only`), como explica el comentario del schema. Cualquier cambio de esquema se refleja en `docs/04-base-de-datos.md`.
- Borrado lógico con `deletedAt`; las consultas de lectura filtran `deletedAt: null`. Un recurso borrado responde 404.
- Solo `likeCount` y `commentCount` de `posts` están desnormalizados (D05): se actualizan en la misma transacción (`prisma.$transaction`) que crea o borra el like o el comentario. Seguidores y seguidos no se guardan como contador: se cuentan con `_count` de Prisma sobre `follows`.
- Selecciona solo los campos que devuelves. Nunca incluyas `passwordHash`, tokens ni el correo de otros usuarios en una respuesta.

## Permisos

- Toda ruta 🔒 lleva el guard de sesión (lo crea Dev 3 en S1-02).
- Editar o borrar compara el autor con el usuario autenticado y responde 403 si no coincide (RN04). Cada caso así tiene su prueba e2e del 403.
- Nadie se sigue a sí mismo (RN06) y nadie se notifica a sí mismo (RN08).
- Al borrar una publicación, sus imágenes se borran de Cloudinary (RN04) a través del servicio de media de Dev 3.

## Errores y logs

- No captures una excepción para ignorarla. Si la capturas, conviértela en la excepción HTTP que corresponde o vuelve a lanzarla.
- Un error de Prisma por clave única (`P2002`) se traduce a 409 y uno de registro inexistente (`P2025`) a 404, en un solo lugar (el filtro global), no en cada servicio.
- Usa el `Logger` de Nest, no `console.log`. Nunca registres contraseñas, tokens, cookies ni el cuerpo completo de una petición de auth.

## Pruebas

- Cada servicio tiene su `*.spec.ts` junto al archivo (`pnpm --filter api test`). Prueba la lógica de negocio, no el framework.
- Cada endpoint tiene en `apps/api/test/` una prueba e2e del caso feliz y, si aplica, del 400, 401, 403 y 404 (`pnpm --filter api test:e2e`). Desde S1-03 el CI levanta PostgreSQL y aplica migraciones, así que las e2e usan la base real.
- Al cambiar el esqueleto (por ejemplo, quitar `GET /` o agregar el prefijo `/api`), actualiza también `app.controller.spec.ts` y `test/app.e2e-spec.ts` para que el CI siga en verde.
