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
infra/              docker-compose (dev y prod), Caddyfile, deploy.sh (lo ejecuta deploy.yml en el VPS)
docs/               documentación; se compila a PDF con tools/docs-pdf
scripts/            crear_issues.mjs, backup-db.sh
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

## Estado actual (28 oct 2026)

Hecho: monorepo (S0-01), CI con el check `verificar` y main protegida (S0-02), VPS con HTTPS (S0-03), web inicializada (S0-07), wireframes como páginas con datos de ejemplo, portada, login y registro solo en el frontend (S1-08, sin llamar a la api), Prisma 6.19.3 con la migración inicial (S0-04), contrato de API v0 (S0-05) y esqueleto desplegado en producción (S1-01): Dockerfiles de api y web, `deploy.yml` activo con `infra/deploy.sh` y rollback de imágenes, prefijo global `/api`, `PrismaModule` global, `GET /api/health` y Swagger en `/api/docs`.

PostgreSQL en el CI (S1-03): las e2e corren contra una base real (`minired_test`) que se migra con `pnpm --filter api test:e2e:db` y se vacía con `resetDatabase` de `apps/api/test/utils/database.ts`; el CI también construye las imágenes Docker sin publicarlas.

Autenticación (S1-02): `ValidationPipe` global, filtro global de errores (`AllExceptionsFilter`), cookie-parser, `trust proxy`, variables validadas al arrancar (`src/config/env.ts`), `src/auth/` con register, login, refresh, logout y me, throttler en register y login, y guard de sesión **global**: toda ruta exige sesión salvo las marcadas con `@Public()`; el usuario llega con `@CurrentUser()`.

Seed de datos de demostración (S1-06): `apps/api/prisma/seed.ts` crea 20 usuarios (contraseña `demo12345`) con seguimientos, publicaciones, comentarios y likes, y recalcula `likeCount`/`commentCount` al final para que queden coherentes con D05. Se corre con `pnpm --filter api prisma db seed`. La configuración de Prisma vive en `apps/api/prisma.config.ts` (reemplaza el `package.json#prisma` deprecado); `prisma.config.ts` y `prisma/seed.ts` están excluidos de `tsconfig.build.json` para no mover la salida de `nest build`.

Todavía no existe, aunque los docs lo describan: helmet y CORS (S4-02), Socket.io y Cloudinary. La configuración global de la api va en `apps/api/src/configure-app.ts`, que usan `main.ts` y las e2e. Cuando una tarea dependa de algo de esta lista, dilo y propón crearlo en su issue; no lo des por hecho.

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
- Los tipos de petición y respuesta que comparten api y web van en `packages/api-types`.
- Si cambias el comportamiento de la api, actualiza `docs/05-api.md` en el mismo PR. Si cambias el esquema, actualiza `docs/04-base-de-datos.md`.
- No instales dependencias que la issue no necesite. Si una es necesaria, justifícala en el PR.
