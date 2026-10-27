---
name: plataforma
description: Reglas para la plataforma del proyecto (Dev 3): autenticación y sesiones, subida de imágenes a Cloudinary, chat y Socket.io, configuración global de NestJS, CI en GitHub Actions, imágenes Docker, despliegue al VPS con Caddy y respaldos. Úsala al tocar auth, sockets, media, .github/workflows, infra/ o scripts/.
---

# Plataforma y tiempo real (Dev 3)

Lee primero `CLAUDE.md` en la raíz. Esta skill agrega las reglas de lo transversal: lo que usan los demás módulos y lo que lleva el código a producción.

## Estado actual

- CI: `.github/workflows/ci.yml`, job `verificar`, en cada PR a `main` con Node 22. Instala con `--frozen-lockfile` y corre lint, typecheck, pruebas unitarias, migraciones y e2e contra un PostgreSQL 16 de servicio (`minired_test`, S1-03), build de todos los paquetes y `docker build` de api y web sin publicar. Es el check obligatorio de `main`. `deploy.yml` ignora los push que solo cambian `docs/`, `*.md` o `.claude/`.
- Documentación: `.github/workflows/docs-pdf.yml` genera el PDF (artefacto `documentacion-pdf`).
- Servidor listo (S0-03): VPS con Ubuntu 24.04, usuario `deploy` con llave, firewall con 22, 80 y 443 (443 también UDP), Docker y Compose, HTTPS de Caddy probado y `~/app` con `docker-compose.yml`, `Caddyfile` y `.env`. Secrets `VPS_HOST`, `VPS_USER` y `VPS_SSH_KEY` cargados en Actions.
- Despliegue (S1-01): `.github/workflows/deploy.yml` construye `apps/api/Dockerfile` y `apps/web/Dockerfile`, publica en GHCR (paquetes públicos), copia `infra/` al VPS y ejecuta `infra/deploy.sh`, que migra, reinicia y vuelve a la etiqueta anterior si `/api/health` falla. Compose y Caddyfile se cambian en el repo, nunca en el servidor.
- Autenticación (S1-02): `src/auth/` y la configuración global de `configure-app.ts` (abajo).
- Pendiente: Socket.io (S1-04), media (S2-01), respaldos (S2-02), endurecimiento con helmet y CORS (S4-02).

## Configuración global de la api

En `apps/api/src/configure-app.ts` (lo usan `main.ts` y las e2e), cuando lo pida su issue. Ya están el prefijo, `PrismaModule`, `/api/health`, Swagger, `ValidationPipe`, `AllExceptionsFilter`, cookie-parser y `trust proxy`; faltan helmet y CORS (S4-02):

- `app.setGlobalPrefix('api')`.
- `ValidationPipe` global con `whitelist: true`, `forbidNonWhitelisted: true` y `transform: true` (`src/common/validation.ts`), que arma `details` con un elemento por campo.
- `app.set('trust proxy', 1)`: un solo proxy (Caddy) delante. No lo subas a `true` ni a más saltos: cualquiera podría elegir su IP con `X-Forwarded-For` y saltarse el throttler.
- Un filtro global de excepciones que responda siempre `{ statusCode, error, message, details }` (`docs/05-api.md`) y traduzca los errores de Prisma `P2002` a 409 y `P2025` a 404. Ningún error interno ni traza llega al cliente.
- `cookie-parser`, `helmet` y `enableCors` solo con `CORS_ORIGIN` y `credentials: true`; nunca `origin: '*'`.
- Swagger en `/api/docs` y el JSON en `/api/docs-json`, que alimenta `packages/api-types`.
- `GET /api/health` que verifica la conexión a la base (S1-01).
- Las variables se leen y validan al arrancar en `src/config/env.ts` (se inyectan con `@Inject(ENV)`): si falta una obligatoria, la api no arranca. Toda variable nueva va a `.env.example` con un valor de ejemplo, a `test/setup-env.ts` y, antes del merge, al `.env` del VPS.

## Autenticación (docs/07-seguridad.md)

- Contraseñas con argon2id (`@node-rs/argon2`, que trae binarios para Alpine y no necesita `allowBuilds`). Nunca se registran en logs ni se devuelven.
- `@nestjs/jwt` se queda en 11.x: la 12 es solo ESM y Jest (CommonJS) no la carga.
- Token de acceso de 15 minutos (`JWT_ACCESS_TTL`, JWT HS256 con `sub` = id) en la cookie `access_token` (`Path=/`); token de renovación (`REFRESH_TOKEN_TTL_DAYS`, 32 bytes aleatorios guardados como SHA-256) en `refresh_token` (`Path=/api/auth`). Las dos cookies duran lo que el refresh, para que `proxy.ts` de la web siga viendo `access_token`. Ambas `HttpOnly`, `Secure` en producción y `SameSite=Lax`. Nunca en el cuerpo de la respuesta ni en `localStorage`.
- El token de renovación se guarda con hash y se rota en cada `POST /api/auth/refresh`. Si llega uno ya rotado, se revocan todas las sesiones del usuario (RN12). Un token reutilizado se detecta porque tiene `revoked_at` no nulo, no por `replaced_by`: esa columna queda en `null` si se borra el token nuevo (`ON DELETE SET NULL`), y además el logout revoca sin reemplazar.
- `@nestjs/throttler`: 5 intentos de login y 5 de registro por minuto por IP (RN13, S1-02), respuesta 429.
- En login, el mismo mensaje para usuario inexistente y contraseña incorrecta.
- Ningún cambio de estado por `GET` (CSRF).
- `SessionGuard` es global (`APP_GUARD` en `AuthModule`): toda ruta exige sesión salvo las marcadas con `@Public()` (health, register, login, refresh y logout). `@CurrentUser()` entrega `{ id }`. Las rutas 🔒 responden 401 sin sesión.

## Imágenes (S2-01)

- Se suben por el backend (D04) con `POST /api/media`, multipart. Solo jpeg, png y webp, máximo 5 MB (413 si se pasa). Valida el tamaño en el límite de multer, no después de leer el archivo.
- Las claves de Cloudinary solo existen en el servidor. La respuesta es el objeto `Media` de `docs/05-api.md`, con `publicId`, `width` y `height`.
- Sube cada imagen a la carpeta del usuario (`users/{id}/`) y ofrece a Dev 2 una función que verifique que un `publicId` le pertenece (empieza con `users/{id}/`, con la barra final), para responder 400 en publicaciones y avatar.
- Ofrece a Dev 2 una función para borrar imágenes por `publicId` (RN04).

## Socket.io y chat

- El handshake valida la misma cookie de sesión; sin sesión válida se rechaza la conexión.
- El Gateway declara su propio CORS: `@WebSocketGateway({ cors: { origin: CORS_ORIGIN, credentials: true } })`. El `enableCors` de HTTP no lo cubre. En local la web (:3001) se conecta directo a la api (:3000) con `NEXT_PUBLIC_SOCKET_URL`; en producción es el mismo origen a través de Caddy.
- `conversation:join` y el envío de mensajes verifican que el usuario participa en la conversación (RN09): `conversation:join` responde por acknowledgement `{ ok: false, error: "forbidden" }` y el envío por HTTP, 403. Mensajes de 1 a 2000 caracteres.
- Solo los eventos de `docs/05-api.md`. Cualquier evento nuevo se documenta ahí en el mismo PR.
- Los contadores en vivo y las notificaciones salen de eventos de dominio que emiten los módulos de Dev 2 (D08); el gateway escucha y emite, no lo llaman directamente los servicios.
- Valida los datos que llegan por socket igual que un DTO HTTP.

## CI

- `verificar` debe seguir siendo el único check obligatorio y debe correr lo mismo que un desarrollador corre en local (ver `CLAUDE.md`).
- Cuando se agreguen pasos, mantén `--frozen-lockfile` y Node 22. Las e2e usan la base del servicio de PostgreSQL; una variable nueva que la api exija al arrancar se define también en `apps/api/test/setup-env.ts`.
- Nunca desactives ni saltes una prueba para que el CI pase.
- Subir cambios en `.github/workflows/` requiere el permiso `workflow` en `gh` (`gh auth refresh -s workflow`).

## Despliegue

- Imágenes construidas en CI y publicadas en GHCR (D06); el VPS solo hace `docker compose pull` y `up -d`. Nunca compilar en el servidor.
- Etiqueta cada imagen con el SHA del commit para poder volver atrás.
- La imagen de la web recibe `NEXT_PUBLIC_APP_URL` y `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` como `build-args` desde las Variables de GitHub (no Secrets: no son secretas). Su Dockerfile las declara con `ARG` y `ENV` antes de `next build`. Ponerlas solo en el `environment` del compose no sirve, porque Next ya las escribió en el JavaScript.
- PostgreSQL sin puertos publicados: solo en la red interna de Docker.
- Caddy enruta `/api/*` y `/socket.io/*` a la api y lo demás a la web, con HTTPS automático (D07). El dominio sale de `DOMAIN` en el `.env` del servidor.
- Secretos solo en GitHub Secrets y en `~/app/.env` del VPS. Nunca en el repo, en issues, en PRs ni en los logs del workflow. Tampoco la IP, el usuario SSH ni el proveedor: el repo es público.
- Respaldos con `scripts/backup-db.sh` por cron, guardados fuera del servidor, y la restauración probada (S2-02, S4-03).
