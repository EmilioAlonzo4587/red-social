# ChatInit: red social (monorepo)

Instrucciones para agentes de IA que trabajan en este repositorio. Las reglas por rol están en `.claude/skills/`:

- `frontend-web`: Dev 1, Next.js en `apps/web`.
- `backend-api`: Dev 2, NestJS y Prisma en `apps/api` (usuarios, publicaciones, feed, seguimientos, likes, comentarios, búsqueda, notificaciones).
- `plataforma`: Dev 3, autenticación, Cloudinary, chat y Socket.io, CI/CD, VPS y respaldos.

La fuente de verdad es `docs/`. Antes de cambiar algo, lee la sección que aplica: reglas de negocio RN01 a RN14 en `docs/02-analisis.md`, decisiones D01 a D09 en `docs/03-arquitectura.md`, esquema en `docs/04-base-de-datos.md`, contrato en `docs/05-api.md`, despliegue en `docs/06-devops.md`, seguridad en `docs/07-seguridad.md`, flujo y definición de terminado en `docs/08-plan-de-trabajo.md`. Si el código y la documentación no coinciden, avisa en lugar de elegir uno en silencio.

## Estructura

```
apps/api            NestJS 11 + Jest. Prisma en apps/api/prisma/
apps/web            Next.js 16 (App Router) + React 19 + Tailwind 4
packages/api-types  @red/api-types: tipos compartidos entre api y web
infra/              docker-compose (dev y prod), Caddyfile, deploy.sh (lo ejecuta deploy.yml en el VPS), backup-db.sh
docs/               documentación; se compila a PDF con tools/docs-pdf
scripts/            crear_issues.mjs
```

En producción Caddy envía `/api/*` y `/socket.io/*` a la api y todo lo demás a la web, en un solo dominio (D02).

## Comandos

- pnpm 12.11.2 (`npm install -g pnpm@12.11.2`) y Node 22.
- `pnpm install` en la raíz. Base local: `docker compose -f infra/docker-compose.dev.yml up -d`.
- `pnpm dev` levanta api en :3000 y web en :3001.
- Por paquete: `pnpm --filter api <script>` o `pnpm --filter web <script>`.
- Antes de abrir un PR corre lo mismo que el CI:

```bash
pnpm -r --if-present lint
pnpm -r --if-present typecheck
pnpm -r --if-present test
pnpm --filter api test:e2e:db   # migra la base minired_test (la crea si no existe)
pnpm --filter api test:e2e
pnpm -r --if-present build
```

## Estado actual (30 oct 2026)

Hecho: monorepo (S0-01), CI con el check `verificar` y main protegida (S0-02), VPS con HTTPS (S0-03), web inicializada (S0-07), wireframes como páginas con datos de ejemplo, portada, login y registro (S1-08), Prisma 6.19.3 con la migración inicial (S0-04), contrato de API v0 (S0-05) y esqueleto desplegado en producción (S1-01): Dockerfiles de api y web, `deploy.yml` activo con `infra/deploy.sh` y rollback de imágenes, prefijo global `/api`, `PrismaModule` global, `GET /api/health` y Swagger en `/api/docs`.

PostgreSQL en el CI (S1-03): las e2e corren contra una base real (`minired_test`) que se migra con `pnpm --filter api test:e2e:db` y se vacía con `resetDatabase` de `apps/api/test/utils/database.ts`; el CI también construye las imágenes Docker sin publicarlas.

Autenticación (S1-02): `ValidationPipe` global, filtro global de errores (`AllExceptionsFilter`), cookie-parser, `trust proxy`, variables validadas al arrancar (`src/config/env.ts`), `src/auth/` con register, login, refresh, logout y me, throttler en register y login, y guard de sesión **global**: toda ruta exige sesión salvo las marcadas con `@Public()`; el usuario llega con `@CurrentUser()`.

Seed de datos de demostración (S1-06): `apps/api/prisma/seed.ts` crea 20 usuarios (contraseña `demo12345`) con seguimientos, publicaciones, comentarios y likes, y recalcula `likeCount`/`commentCount` al final para que queden coherentes con D05. Se corre con `pnpm --filter api prisma db seed`. La configuración de Prisma vive en `apps/api/prisma.config.ts` (reemplaza el `package.json#prisma` deprecado); `prisma.config.ts` y `prisma/seed.ts` están excluidos de `tsconfig.build.json` para no mover la salida de `nest build`.

Socket autenticado (S1-04): `src/realtime/` con un solo Gateway. El handshake valida la cookie con `SessionTokenService` (la misma regla que el guard HTTP) y el `Origin` contra `CORS_ORIGIN`, que ahora es obligatoria; cada socket entra a `user:{id}`, recibe `session:ready` y se cierra cuando vence su JWT. `apps/api/scripts/probar-socket.mjs` lo prueba en producción.

Imágenes en Cloudinary (S2-01): `src/media/` (`MediaModule`) con `POST /api/media` (jpeg, png o webp, hasta 5 MB) y `CloudinaryService`, que sube cada imagen a `users/{id}/` y expone `belongsToUser`/`deleteByPublicId` para que Dev 2 las use en publicaciones (S2-04) y avatar (S2-11). Variables `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET` validadas al arrancar.

Respaldo diario (S2-02): `infra/backup-db.sh` llega a `~/app` del VPS con cada despliegue (`deploy.yml` lo copia y `deploy.sh` lo instala con `install -m 755`) y cron lo corre a las 03:00 UTC. Hace `pg_dump -Fc` dentro del contenedor `db`, lo valida leyéndolo entero con `pg_restore -f /dev/null` antes de darlo por bueno, lo sube cifrado con rclone (remoto `crypt` sobre Google Drive) al remoto de `BACKUP_REMOTE` y conserva 7 en el VPS y 7 fuera. `BACKUP_REMOTE` reemplaza a `BACKUP_UPLOAD_CMD` (ya no hay `eval` ni `source .env`) y solo la lee el script: no va en `env.ts`. rclone se instala en el VPS, no es dependencia del repo. La restauración probada es S4-03.

Publicaciones (S2-04): `src/posts/` con `POST /api/posts`, `GET /api/posts/:id` y `DELETE /api/posts/:id` (borrado lógico, RN03 y RN04). Compositor de publicaciones (S2-08): `apps/web/src/components/post-composer.tsx` y `src/lib/media.ts`, montado arriba de las pestañas en `/feed`; sube cada imagen con `POST /api/media` y crea la publicación con `POST /api/posts`.

Feed (S2-05): `src/feed/` con `GET /api/feed` (propias y de seguidos), `GET /api/feed/explore` (todas) y `GET /api/users/:username/posts`, los tres paginados por cursor (sin `OFFSET`) e indicando `likedByMe`.

Feed en la web (S2-09): `/feed` ya pide `GET /api/feed`/`/api/feed/explore` de verdad, con "Cargar más" por cursor, estado vacío en Siguiendo y publicar recarga la lista. `PostCard` ahora recibe `PostDto` real y muestra las imágenes con `next/image` (`images.remotePatterns` en `next.config.ts` para `res.cloudinary.com`, formato automático con `cloudinaryImageUrl()` en `src/lib/media.ts`). `/u/[username]` también muestra sus publicaciones reales (`GET /api/users/:username/posts`, sin paginar ahí).

Editar perfil y avatar (S2-11): `apps/web/src/app/perfil/editar/page.tsx` (server component, trae `GET /api/auth/me`) y `EditProfileForm`: nombre visible, biografía y cambio/borrado de avatar con `PATCH /api/users/me`.

Pruebas en `apps/web` (S2-08): antes no existían. Ahora Vitest + React Testing Library, `pnpm --filter web test`, ver la skill `frontend-web`.

Likes (S2-07): `src/likes/` con `PUT /api/posts/:id/like` y `DELETE /api/posts/:id/like`, ambos idempotentes (RN05), responden `{ likeCount, likedByMe }` (`LikeStatusDto`) y 404 si la publicación no existe.

Likes, seguir y eliminar en la web (S2-10): `PostCard` tiene like optimista (`PUT`/`DELETE /api/posts/:id/like`, corrige con la respuesta real y revierte si falla) y, si `currentUserId` coincide con el autor, un botón "Eliminar" con confirmación dentro de la propia tarjeta (no `confirm()` del navegador) que llama `DELETE /api/posts/:id` y hace desaparecer la publicación sin recargar la lista. `/u/[username]` pasa `currentUserId` desde `GET /api/auth/me` (server component); `/feed` lo pide una vez al montar porque es un client component. `ProfileStats` (nuevo, usado por `/u/[username]`) tiene el botón de seguir (`PUT`/`DELETE /api/users/:username/follow`, sin optimismo) y oculta Seguir/Mensaje en el propio perfil (RN06) mostrando "Editar perfil" en su lugar.

Comentarios (S3-01): `src/comments/` con `GET`/`POST /api/posts/:id/comments` (paginado por cursor, del más antiguo al más reciente, RN07) y `DELETE /api/comments/:id` (403 si es ajeno, RN04). Todavía sin consumir desde la web (le toca a S3-08).

Búsqueda de usuarios (S3-02): `GET /api/users/search?q=` en `UsersController`, hasta 20 resultados, 400 si `q` tiene menos de 2 caracteres (RN14). Todavía sin consumir desde la web (le toca a S3-09).

Notificaciones persistidas (S3-03): `src/notifications/` con `GET /api/notifications` (paginado por cursor, de la más reciente a la más antigua), `GET /api/notifications/unread-count` y `POST /api/notifications/read` (`{ ids }` o `{ all: true }`). `NotificationsListener` crea la de like, comentario, seguimiento y mensaje (nunca para uno mismo, RN08; de mensaje, una sin leer por remitente) y emite `notification.created`, que el Gateway enviará en S3-05. No se muestran ni cuentan las de publicaciones o comentarios eliminados. El listener termina después de responder: las e2e que cuentan `emit` lo apagan con `overrideProvider`. Todavía sin consumir desde la web (le toca a S3-07).

Botón de cerrar sesión (S3-13): `logout()` en `src/lib/api-client.ts` llama `POST /api/auth/logout` y siempre recarga a la portada (`window.location.href`), incluso si la petición falla, porque el endpoint borra las cookies y responde 204 siempre. El botón vive en `LogoutButton`, fijo en la esquina inferior izquierda (montado en `layout.tsx`, no en `Navbar`), visible solo con sesión activa.

Mostrar/ocultar contraseña (S3-11): `PasswordInput` (`apps/web/src/components/password-input.tsx`) envuelve el input con un botón que alterna `type="password"`/`type="text"` (ícono de ojo, `aria-pressed`), usado en login y registro. No valida ni cambia el límite de 128 caracteres, solo la visibilidad.

Atrás no muestra login ni otra sesión (S3-12): `src/proxy.ts` ahora también redirige a `/feed` si hay sesión y la ruta es pública (`/`, `/login`, `/registro`), el espejo de la regla que ya existía; además agrega `Cache-Control: no-store` a toda respuesta que deja pasar. Login y registro usan `window.location.replace("/feed")` tras el éxito, **no** `router.replace`: la caché del router de Next.js sirve la navegación "atrás" desde memoria sin pasar por el servidor ni por `proxy.ts`, y eso no se puede desactivar por configuración (confirmado en la documentación oficial de `staleTimes`), así que solo una navegación completa real lo evita. `BfcacheReload` (montado en `layout.tsx`) escucha `pageshow`: si el navegador restauró la página desde su back-forward cache (`event.persisted`), fuerza `window.location.reload()` para no mostrar datos de una cuenta distinta a la que inició sesión después. `event.persisted` es poco confiable en algunos navegadores (puede dar `true` en una carga normal); por eso se cruza con `performance.getEntriesByType("navigation")[0].type === "back_forward"` antes de recargar — sin ese cruce, un falso positivo recarga la página, lo que dispara `pageshow` de nuevo y puede repetirse sin parar.

Foto de perfil real (S3-15): `Avatar` (`apps/web/src/components/avatar.tsx`) recibe `avatarPublicId` opcional; si existe, muestra la foto real con `cloudinaryImageUrl()`, si no, cae en las iniciales. Conectado en `PostCard` (el avatar del autor también enlaza a su perfil, igual que su nombre), el encabezado de `/u/[username]` (vía `ProfileAvatar`, que además abre una vista ampliada al hacer click) y `EditProfileForm` (tu propia foto guardada, que antes nunca se mostraba). `EditProfileForm` también tiene un enlace "Cancelar" junto a "Guardar cambios" que regresa al perfil sin enviar nada; al guardar con éxito, redirige al perfil (`router.push`) en vez de quedarse en el formulario, porque antes seguía mostrando los datos viejos (el prop `me` nunca se actualizaba con la respuesta del PATCH).

Lista de seguidores y seguidos (S3-10): `FollowListModal` (`apps/web/src/components/follow-list-modal.tsx`) es un modal que pide `GET /api/users/:username/followers` o `/following` (paginado por cursor, con "Cargar más"), muestra cada fila con avatar, nombre y username enlazando a su perfil, y un estado vacío por tipo. Se abre desde `ProfileStats` al tocar los contadores "seguidores"/"seguidos" (ahora son botones, no texto suelto); se monta con `key={openList}` para que cada apertura sea una instancia nueva, sin necesitar resetear el estado a mano.

Barra lateral de navegación (S3-14): `Sidebar` (`apps/web/src/components/sidebar.tsx`), montada en `layout.tsx` en una fila flex junto a `{children}` (no `fixed`, así el contenido centrado de cada página se acomoda al espacio que le queda en vez de que la barra lo tape). Inicio, Notificaciones, Mensajes y Mi perfil (este último pedido con `GET /api/auth/me` al montar, igual que `LogoutButton`). Notificaciones y Mensajes enlazan a sus páginas actuales (todavía wireframes) hasta que existan S3-07 y S3-06. No duplica el buscador (S3-09, barra superior) ni cerrar sesión (S3-13, esquina inferior izquierda). Oculta por debajo del breakpoint `sm` de Tailwind (640 px) para no romper pantallas angostas.

Todavía no existe, aunque los docs lo describan: helmet y CORS de HTTP (S4-02), los eventos de Socket.io de likes, chat y notificaciones (S2-03, S3-05) y el cliente de Socket.io en la web. La configuración global de la api va en `apps/api/src/configure-app.ts`, que usan `main.ts` y las e2e. Cuando una tarea dependa de algo de esta lista, dilo y propón crearlo en su issue; no lo des por hecho.

## Flujo de trabajo

- Cada cambio sale de una issue. Rama corta desde `main` con su ID: `feat/S2-04-api-publicaciones`, `fix/S3-01-contador-comentarios`, `docs/...`.
- Commits en Conventional Commits, en español: `feat(posts): crear publicación con imágenes`.
- Nadie hace push a `main`. PR con `Closes #<número>`, check `verificar` en verde, una aprobación y squash merge.
- Los commits los hace cada integrante con su propia cuenta. Un agente no hace commit, push ni PR a menos que la persona se lo pida en ese momento.
- Una issue está terminada cuando cumple la definición de `docs/08-plan-de-trabajo.md`: CI verde y aprobación, desplegada, endpoints en Swagger, prueba del caso feliz y del caso prohibido cuando aplica, y variables nuevas en `.env.example`.
- Cambios pequeños y enfocados en la issue. Si algo de otra área necesita cambiar, menciónalo en lugar de tocarlo.

## Reglas para todos

- Nunca subas `.env`, contraseñas, tokens, llaves ni la IP o el usuario del servidor. El repo es público. Las variables nuevas van a `.env.example` con un valor de ejemplo, nunca el real.
- TypeScript estricto: sin `any` (usa `unknown` y estrecha el tipo), sin `@ts-ignore` ni `eslint-disable` para silenciar un error real.
- Nombres y mensajes visibles para el usuario en español; identificadores de código y JSON en inglés y camelCase, como en `docs/05-api.md`.
- Los tipos de petición y respuesta que comparten api y web van en `packages/api-types`. Si agregas o cambias un endpoint, regenera esos tipos (`pnpm --filter @red/api-types generate` con la api corriendo) y exporta los DTOs nuevos desde su `index.ts` en el mismo PR.
- Si cambias el comportamiento de la api, actualiza `docs/05-api.md` en el mismo PR. Si cambias el esquema, actualiza `docs/04-base-de-datos.md`.
- No instales dependencias que la issue no necesite. Si una es necesaria, justifícala en el PR.
