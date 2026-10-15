# Mini Red Social

Red social web con publicaciones, likes, comentarios, seguimiento, notificaciones y chat en tiempo real.
Monorepo con Next.js, NestJS, PostgreSQL y Prisma, desplegado con Docker en un VPS.

| | URL |
|---|---|
| Aplicación | https://[dominio] |
| API | https://[dominio]/api |
| Documentación de la API (Swagger) | https://[dominio]/api/docs |

## Estructura

```
apps/web            Next.js (frontend)
apps/api            NestJS (backend) y prisma/ (esquema, migraciones, seed)
packages/api-types  Tipos generados desde OpenAPI
infra/              docker-compose, Caddyfile y plantillas de CI/CD
scripts/            Creación de issues y respaldos
docs/               Documentación del proyecto (Markdown + Mermaid)
tools/docs-pdf/     Generador del PDF de la documentación
```

## Documentación

La documentación vive en [`docs/`](docs) y GitHub muestra sus diagramas directamente:

1. [Introducción](docs/01-introduccion.md)
2. [Análisis del sistema](docs/02-analisis.md): requerimientos, reglas de negocio, historias y diagramas de flujo
3. [Arquitectura](docs/03-arquitectura.md)
4. [Base de datos](docs/04-base-de-datos.md): ERD, diccionario de datos e índices
5. [Contrato de la API](docs/05-api.md)
6. [DevOps y despliegue](docs/06-devops.md)
7. [Seguridad](docs/07-seguridad.md)
8. [Plan de trabajo](docs/08-plan-de-trabajo.md): cronograma y backlog
9. [Guía de inicio](docs/09-guia-de-inicio.md)

El PDF de entrega se genera con `pnpm docs:pdf` (queda en `dist/documentacion.pdf`) y automáticamente en GitHub Actions con cada cambio en `docs/`.

## Entorno local

Requisitos: Node 22, pnpm 12.11.2 (`npm install -g pnpm@12.11.2`), Docker y Git.

```bash
git clone https://github.com/EmilioAlonzo4587/red-social.git && cd red-social
cp .env.example .env
docker compose -f infra/docker-compose.dev.yml up -d   # PostgreSQL en localhost:5432
pnpm install
pnpm dev                                               # api en http://localhost:3000
```

La web se agrega en S0-07 y las migraciones de la base en S0-04. Detalle completo en la [guía de inicio](docs/09-guia-de-inicio.md); variables de entorno en [`.env.example`](.env.example).