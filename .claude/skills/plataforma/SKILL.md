---
name: plataforma
description: Reglas para la plataforma del proyecto (Dev 3): autenticación y sesiones, subida de imágenes a Cloudinary, chat y Socket.io, configuración global de NestJS, CI en GitHub Actions, imágenes Docker, despliegue al VPS con Caddy y respaldos. Úsala al tocar auth, sockets, media, .github/workflows, infra/ o scripts/.
---

# Plataforma y tiempo real (Dev 3)

Lee primero `CLAUDE.md` en la raíz. Esta skill agrega las reglas de lo transversal: lo que usan los demás módulos y lo que lleva el código a producción.

## Estado actual

- CI: `.github/workflows/ci.yml`, job `verificar`, en cada PR a `main` con Node 22. Instala con `--frozen-lockfile` y corre lint, typecheck, pruebas unitarias, `pnpm --filter api test:e2e` y build de todos los paquetes. Es el check obligatorio de `main`.
- Documentación: `.github/workflows/docs-pdf.yml` genera el PDF (artefacto `documentacion-pdf`).
- Servidor listo (S0-03): VPS con Ubuntu 24.04, usuario `deploy` con llave, firewall con 22, 80 y 443, Docker y Compose, HTTPS de Caddy probado y `~/app` con `docker-compose.yml`, `Caddyfile` y `.env`. Secrets `VPS_HOST`, `VPS_USER` y `VPS_SSH_KEY` cargados en Actions.
- Pendiente: mover `infra/plantillas/deploy.yml` a `.github/workflows/` (S1-01), PostgreSQL y migraciones en el CI (S1-03), auth (S1-02), Socket.io (S1-04), media (S2-01), respaldos (S2-02), endurecimiento con helmet y CORS (S4-02).

## Configuración global de la api

En `apps/api/src/main.ts`, cuando lo pida su issue:

- `app.setGlobalPrefix('api')`.
- `ValidationPipe` global con `whitelist: true`, `forbidNonWhitelisted: true` y `transform: true`.
- Un filtro global de excepciones que responda siempre `{ statusCode, error, message, details }` (`docs/05-api.md`) y traduzca los errores de Prisma `P2002` a 409 y `P2025` a 404. Ningún error interno ni traza llega al cliente.
- `cookie-parser`, `helmet` y `enableCors` solo con `CORS_ORIGIN` y `credentials: true`; nunca `origin: '*'`.
- Swagger en `/api/docs` y el JSON en `/api/docs-json`, que alimenta `packages/api-types`.
- `GET /api/health` que verifica la conexión a la base (S1-01).
- Las variables se leen y validan al arrancar: si falta una obligatoria, la api no arranca. Toda variable nueva va a `.env.example` con un valor de ejemplo.

## Autenticación (docs/07-seguridad.md)

- Contraseñas con argon2id. Nunca se registran en logs ni se devuelven.
- Token de acceso de 15 minutos (`JWT_ACCESS_TTL`) en la cookie `access_token`; token de renovación (`REFRESH_TOKEN_TTL_DAYS`) en `refresh_token`. Ambas `HttpOnly`, `Secure` en producción y `SameSite=Lax`. Nunca en el cuerpo de la respuesta ni en `localStorage`.
- El token de renovación se guarda con hash y se rota en cada `POST /api/auth/refresh`. Si llega uno ya rotado, se revocan todas las sesiones del usuario.
- `@nestjs/throttler`: 5 intentos de login y 5 de registro por minuto por IP (RN13, S1-02), respuesta 429.
- En login, el mismo mensaje para usuario inexistente y contraseña incorrecta.
- Ningún cambio de estado por `GET` (CSRF).
- Expón un guard de sesión y un decorador del usuario actual que usen los módulos de Dev 2. Las rutas 🔒 responden 401 sin sesión.

## Imágenes (S2-01)

- Se suben por el backend (D04) con `POST /api/media`, multipart. Solo jpeg, png y webp, máximo 5 MB (413 si se pasa). Valida el tamaño en el límite de multer, no después de leer el archivo.
- Las claves de Cloudinary solo existen en el servidor. La respuesta devuelve `publicId`, `width` y `height`.
- Ofrece a Dev 2 una función para borrar imágenes por `publicId` (RN04).

## Socket.io y chat

- El handshake valida la misma cookie de sesión; sin sesión válida se rechaza la conexión.
- `conversation:join` y el envío de mensajes verifican que el usuario participa en la conversación; si no, error o 403 (RN09). Mensajes de 1 a 2000 caracteres.
- Solo los eventos de `docs/05-api.md`. Cualquier evento nuevo se documenta ahí en el mismo PR.
- Los contadores en vivo y las notificaciones salen de eventos de dominio que emiten los módulos de Dev 2 (D08); el gateway escucha y emite, no lo llaman directamente los servicios.
- Valida los datos que llegan por socket igual que un DTO HTTP.

## CI

- `verificar` debe seguir siendo el único check obligatorio y debe correr lo mismo que un desarrollador corre en local (ver `CLAUDE.md`).
- Cuando se agreguen pasos, mantén `--frozen-lockfile` y Node 22. En S1-03: servicio de PostgreSQL 16, `prisma migrate deploy` y las e2e contra esa base.
- Nunca desactives ni saltes una prueba para que el CI pase.
- Subir cambios en `.github/workflows/` requiere el permiso `workflow` en `gh` (`gh auth refresh -s workflow`).

## Despliegue

- Imágenes construidas en CI y publicadas en GHCR (D06); el VPS solo hace `docker compose pull` y `up -d`. Nunca compilar en el servidor.
- Etiqueta cada imagen con el SHA del commit para poder volver atrás.
- PostgreSQL sin puertos publicados: solo en la red interna de Docker.
- Caddy enruta `/api/*` y `/socket.io/*` a la api y lo demás a la web, con HTTPS automático (D07). El dominio sale de `DOMAIN` en el `.env` del servidor.
- Secretos solo en GitHub Secrets y en `~/app/.env` del VPS. Nunca en el repo, en issues, en PRs ni en los logs del workflow. Tampoco la IP, el usuario SSH ni el proveedor: el repo es público.
- Respaldos con `scripts/backup-db.sh` por cron, guardados fuera del servidor, y la restauración probada (S2-02, S4-03).
