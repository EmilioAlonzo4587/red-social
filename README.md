# ChatInit

Red social web en producción. Cada persona se registra, publica texto e imágenes, sigue a otras personas, reacciona y comenta, conversa por chat privado y recibe notificaciones al instante.

Es un monorepo con frontend en Next.js, backend en NestJS, PostgreSQL con Prisma y tiempo real con Socket.io, desplegado con Docker en un VPS con HTTPS y despliegue continuo desde `main`.

| | URL |
|---|---|
| Aplicación (frontend) | https://chatinit.duckdns.org |
| API (backend) | https://chatinit.duckdns.org/api |
| Documentación de la API (Swagger) | https://chatinit.duckdns.org/api/docs |
| Estado de la API y la base | https://chatinit.duckdns.org/api/health |

Todo el contenido requiere una cuenta: sin sesión solo se ven la portada, el inicio de sesión y el registro. En `/api/docs` se puede probar cualquier ruta: primero `POST /api/auth/login` (o `register`) con *Try it out*, y el navegador manda la cookie de sesión en las siguientes.

## Funciones

- **Cuenta y perfil:** registro e inicio de sesión con usuario o correo, nombre visible, biografía y foto. Contraseñas con argon2id y sesión en cookies `HttpOnly` que se renuevan solas.
- **Publicaciones:** texto, hasta 4 imágenes o ambos; editar el texto y borrar las propias. Las imágenes se ven completas y en `/p/{id}` se abren en un visor.
- **Feed:** pestañas Siguiendo y Explorar, paginadas, con un aviso de "Ver N publicaciones nuevas" que llega en vivo.
- **Reacciones y comentarios:** seis reacciones (me gusta, me encanta, me divierte, me asombra, me entristece, me enoja), comentarios con respuestas de un nivel y contadores que se actualizan en vivo. Selector de emojis en comentarios y chat.
- **Personas:** seguir y dejar de seguir, listas de seguidores y seguidos, y búsqueda de usuarios con teclado.
- **Notificaciones:** de reacciones, comentarios, respuestas y seguimientos, en vivo con aviso en pantalla y sonido, y guardadas en un panel con leídas y no leídas.
- **Chat 1 a 1:** mensajes en tiempo real, no leídos, "escribiendo…", "Visto" y "en línea".
- **Modo oscuro**, diseño adaptado al celular y navegación con teclado.

## Tecnologías

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Backend | NestJS 11, TypeScript, `class-validator`, Swagger (OpenAPI) |
| Tiempo real | Socket.io 4.8 |
| Base de datos | PostgreSQL 16 con Prisma 6 (`citext`, `pg_trgm`, `CHECK` e índices parciales) |
| Imágenes | Cloudinary |
| Pruebas | Jest y Supertest en la api (unitarias y e2e contra PostgreSQL), Vitest y Testing Library en la web |
| Infraestructura | Docker Compose, Caddy (HTTPS automático), VPS con Ubuntu |
| CI/CD | GitHub Actions: CI en cada PR; imágenes en GHCR y despliegue automático con vuelta atrás |
| Monorepo | pnpm workspaces; tipos compartidos generados desde OpenAPI (`packages/api-types`) |

Los motivos de cada elección y las decisiones de arquitectura (D01 a D11) están en [Arquitectura](docs/03-arquitectura.md).

## Arquitectura

Un monolito modular en NestJS y una aplicación Next.js, servidos bajo **un solo dominio**: Caddy envía `/api`, `/api/docs` y `/socket.io` a la api y todo lo demás a la web. Así la cookie de sesión es del mismo sitio que la aplicación (D02).

```mermaid
flowchart LR
  B[Navegador] -->|HTTPS 443| C[Caddy]
  subgraph VPS [VPS · Docker Compose]
    C -->|"/"| W[web · Next.js]
    C -->|"/api, /api/docs, /socket.io"| A[api · NestJS + Socket.io]
    W -->|"SSR: http://api:3000 + cookie"| A
    A -->|red interna| D[(PostgreSQL)]
    D -.->|respaldo diario cifrado| BK[Google Drive]
  end
  A -->|subida de imágenes| CL[Cloudinary]
  B -->|imágenes optimizadas| CL
  GH[GitHub Actions] -->|imagen por commit| R[GHCR]
  R -->|docker compose pull| VPS
```

Dentro de la api, cada área es un módulo (`auth`, `users`, `posts`, `feed`, `follows`, `likes`, `comments`, `notifications`, `conversations`, `media`, `realtime`). Los módulos no se llaman entre sí para avisarse: emiten eventos de dominio (`like.changed`, `comment.changed`, `post.created`, …) que escuchan las notificaciones y el Gateway de Socket.io (D08). El diagrama de módulos y la tabla de eventos están en [Arquitectura](docs/03-arquitectura.md).

## Modelo de datos

```mermaid
erDiagram
  users ||--o{ refresh_tokens : "tiene sesiones"
  users ||--o{ posts : "publica"
  posts ||--o{ post_media : "adjunta"
  posts ||--o{ comments : "recibe"
  users ||--o{ comments : "escribe"
  comments |o--o{ comments : "respuestas"
  users ||--o{ post_likes : "reacciona"
  posts ||--o{ post_likes : "recibe"
  users ||--o{ follows : "sigue / es seguido"
  users ||--o{ conversations : "participa (A o B)"
  conversations ||--o{ messages : "contiene"
  users ||--o{ messages : "envía"
  users ||--o{ notifications : "recibe / provoca"
  posts |o--o{ notifications : "referencia"
  comments |o--o{ notifications : "referencia"
```

Tercera forma normal con una sola desnormalización deliberada (los contadores de reacciones y comentarios en `posts`, D05), borrado lógico en publicaciones y comentarios, identificadores UUID v7 y paginación por cursor en todas las listas. El ERD con todas las columnas, el diccionario de datos y los índices están en [Base de datos](docs/04-base-de-datos.md).

## Levantar el proyecto en local

Requisitos: Node 22, pnpm 12.11.2 (`npm install -g pnpm@12.11.2`), Docker y Git.

```bash
git clone https://github.com/EmilioAlonzo4587/red-social.git && cd red-social
cp .env.example .env                                               # completar las claves de Cloudinary
sed -n '/^# --- Frontend/,$p' .env.example > apps/web/.env.local   # la web solo lee los .env de su carpeta
docker compose -f infra/docker-compose.dev.yml up -d               # PostgreSQL en localhost:5432
pnpm install
pnpm --filter api prisma migrate dev                               # crea las tablas
pnpm --filter api prisma db seed                                   # datos de demostración (opcional)
pnpm dev                                                           # api en :3000, web en http://localhost:3001
```

- Con el seed hay 20 cuentas de demostración (`ana_lopez`, `carlos_mendez`, … ver `apps/api/prisma/seed.ts`), todas con la contraseña `demo12345`.
- Swagger local: http://localhost:3000/api/docs.
- La api no arranca si falta una variable obligatoria y dice cuál en el error. Las claves de Cloudinary son obligatorias aunque no subas imágenes; se crean gratis en [cloudinary.com](https://cloudinary.com).

### Variables de entorno

Todas están en [`.env.example`](.env.example) con un valor de ejemplo. Nunca se sube un `.env` real al repositorio.

| Variable | Para qué | En local |
|---|---|---|
| `DATABASE_URL` | Conexión de Prisma a PostgreSQL | `postgresql://app:app@localhost:5432/minired` |
| `JWT_ACCESS_SECRET` | Firma del token de sesión, mínimo 32 caracteres | Cualquier texto largo (`openssl rand -base64 48`) |
| `JWT_ACCESS_TTL`, `REFRESH_TOKEN_TTL_DAYS` | Duración del token de acceso y de la sesión | `15m` y `7` |
| `CORS_ORIGIN` | Origen de la web que acepta Socket.io | `http://localhost:3001` |
| `PORT` | Puerto de la api | `3000` |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Subida y borrado de imágenes | Las de tu cuenta de Cloudinary |
| `API_INTERNAL_URL` | URL de la api para el renderizado en servidor de la web | `http://localhost:3000` |
| `NEXT_PUBLIC_APP_URL` | URL pública de la web | `http://localhost:3001` |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Cuenta de Cloudinary desde la que la web muestra las imágenes | El mismo `CLOUDINARY_CLOUD_NAME` |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.io directo a la api (solo en local) | `http://localhost:3000` |
| `DOMAIN`, `GHCR_OWNER`, `REPO_NAME`, `IMAGE_TAG`, `POSTGRES_*`, `BACKUP_REMOTE` | Solo en el servidor: dominio, imagen a desplegar, base y respaldos | No hacen falta |

Las variables `NEXT_PUBLIC_*` van también en `apps/web/.env.local` (el segundo comando de arriba las copia). Detalle de cada variable en [DevOps y despliegue](docs/06-devops.md#variables-de-entorno).

### Pruebas

Lo mismo que corre el CI (`verificar`) en cada pull request:

```bash
pnpm -r --if-present lint
pnpm -r --if-present typecheck
pnpm -r --if-present test           # unitarias de la api y de la web
pnpm --filter api test:e2e:db       # crea y migra la base minired_test
pnpm --filter api test:e2e          # e2e contra PostgreSQL real, incluidos los flujos completos
pnpm -r --if-present build
```

## Estructura

```
apps/web            Next.js (frontend)
apps/api            NestJS (backend); prisma/ con el esquema, las migraciones y el seed
packages/api-types  Tipos de la api generados desde OpenAPI, compartidos con la web
infra/              docker-compose (dev y producción), Caddyfile, deploy.sh y backup-db.sh
docs/               Documentación del proyecto (Markdown y Mermaid)
tools/docs-pdf/     Generador del PDF de la documentación
scripts/            Creación de las issues del backlog
```

## Despliegue

Cada merge a `main` construye las imágenes de la api y la web en GitHub Actions, las publica en GHCR con la etiqueta del commit y las despliega en el VPS con `infra/deploy.sh`. Si `/api/health` no responde después del despliegue, vuelve solo a la versión anterior. La base se respalda todos los días, cifrada, fuera del servidor. Todo el proceso está en [DevOps y despliegue](docs/06-devops.md).

## Documentación

La documentación completa vive en [`docs/`](docs) y GitHub muestra sus diagramas:

1. [Introducción](docs/01-introduccion.md): descripción, objetivos, alcance y equipo
2. [Análisis del sistema](docs/02-analisis.md): requerimientos, reglas de negocio (RN01 a RN15), historias y diagramas de flujo
3. [Arquitectura](docs/03-arquitectura.md): despliegue, módulos, eventos, stack y decisiones
4. [Base de datos](docs/04-base-de-datos.md): ERD, diccionario de datos e índices
5. [Contrato de la API](docs/05-api.md): objetos, endpoints, errores y eventos de Socket.io
6. [DevOps y despliegue](docs/06-devops.md): CI/CD, variables de entorno y respaldos
7. [Seguridad](docs/07-seguridad.md)
8. [Plan de trabajo](docs/08-plan-de-trabajo.md): cronograma, backlog y definición de terminado
9. [Guía de inicio](docs/09-guia-de-inicio.md): de cero a un proyecto funcionando, incluido el servidor

El PDF de entrega se genera con `pnpm docs:pdf` (queda en `dist/documentacion.pdf`) y en GitHub Actions con cada cambio en `docs/`.

## Equipo

| Rol | Área |
|---|---|
| Dev 1 · Frontend | Next.js, interfaz, vistas y cliente de la api |
| Dev 2 · Datos y contenido | Modelo de datos, usuarios, publicaciones, feed, reacciones, comentarios, seguimiento, búsqueda, notificaciones y Swagger |
| Dev 3 · Plataforma y tiempo real | Monorepo, CI/CD, VPS, autenticación, Socket.io, chat, imágenes, respaldos y seguridad |
