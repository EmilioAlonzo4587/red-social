# Arquitectura

## Estilo arquitectónico

Arquitectura cliente-servidor con un **monolito modular** en el backend. Con tres desarrolladores y un mes de plazo, los microservicios agregarían comunicación entre servicios, despliegues múltiples y fallos distribuidos sin ningún beneficio a esta escala. Los módulos de NestJS mantienen los límites entre dominios dentro de un solo proceso.

## Diagrama de despliegue

```mermaid
flowchart LR
  B[Navegador] -->|HTTPS 443| C[Caddy · HTTPS automático]
  subgraph VPS [VPS · Docker Compose]
    C -->|"/"| W[web · Next.js]
    C -->|"/api, /api/docs, /socket.io"| A[api · NestJS + Socket.io]
    W -->|"SSR: http://api:3000 + cookie"| A
    A -->|red interna, sin puerto publicado| D[(PostgreSQL + volumen)]
    D -.->|pg_dump diario| BK[Respaldo fuera del VPS]
  end
  A -->|subida de archivos| CL[Cloudinary]
  B -->|imágenes optimizadas| CL
  GH[GitHub Actions] -->|imagen :sha| R[GHCR]
  R -->|docker compose pull| VPS
```

Todo el sistema vive bajo **un solo dominio**: Caddy envía `/` a Next.js y `/api`, `/api/docs` y `/socket.io` a NestJS. Así la cookie de sesión pertenece al mismo sitio que la aplicación y no hay que configurar cookies entre dominios.

## Módulos del backend

```mermaid
flowchart TB
  subgraph Dev2 [Datos y contenido]
    U[users] --- P[posts]
    P --- L[likes]
    P --- CM[comments]
    U --- FW[follows]
    N[notifications]
  end
  subgraph Dev3 [Plataforma y tiempo real]
    AU[auth]
    MD[media · Cloudinary]
    CH[chat]
    GW[Gateway Socket.io]
  end
  EV{{Eventos de dominio}}
  L -->|like.changed| EV
  CM -->|comment.changed| EV
  FW -->|follow.created| EV
  CH -->|message.created| EV
  EV --> N
  N -->|notification.created| EV
  EV --> GW
  AU -.->|guard de sesión| P & CH & GW
  P -.-> MD
```

Los módulos de contenido **no llaman al Gateway**: publican eventos con `@nestjs/event-emitter`, y el Gateway los escucha y los envía por socket. Ese contrato permite que Dev 2 y Dev 3 trabajen en paralelo y que cada lado se pruebe por separado.

## Renderizado en el servidor con sesión

```mermaid
sequenceDiagram
  actor U as Navegador
  participant C as Caddy
  participant W as Next.js (servidor)
  participant A as API NestJS
  U->>C: GET /feed (cookie access_token)
  C->>W: GET /feed
  W->>W: middleware: ¿hay cookie? si no, redirige a /
  W->>A: GET http://api:3000/api/feed (reenvía la cookie)
  A-->>W: 200 publicaciones
  W-->>U: HTML ya renderizado
  U->>C: WebSocket /socket.io (misma cookie)
  C->>A: upgrade
  A-->>U: suscripciones en vivo
```

## Tiempo real

| Sala | Quién entra | Eventos que recibe |
|---|---|---|
| `user:{id}` | Cada usuario al conectarse | `notification:new`, `conversation:updated` |
| `post:{id}` | Clientes con esa publicación en pantalla | `post:likes`, `post:comments` |
| `conv:{id}` | Participantes de la conversación, verificados al unirse | `message:new` |

Los mensajes de chat se envían por REST (`POST /api/conversations/:id/messages`) y se distribuyen por socket. Así se validan con los mismos DTOs, quedan documentados en Swagger y se prueban con Supertest.

El backend corre en **una sola instancia**. Para escalar a varias haría falta el adaptador de Redis para Socket.io; queda registrado como deuda técnica.

## Stack tecnológico

| Capa | Tecnología | Motivo |
|---|---|---|
| Frontend | Next.js (App Router), React, TypeScript | SSR y prerenderizado nativos; el equipo domina el ecosistema Node. |
| Backend | NestJS, TypeScript | Módulos e inyección de dependencias, DTOs con `class-validator`, Swagger por decoradores y Gateway de WebSockets integrados. |
| Tiempo real | Socket.io | Salas, reconexión automática e integración con NestJS. |
| Base de datos | PostgreSQL 16 | Relacional, con `citext`, `pg_trgm`, restricciones `CHECK` e índices parciales. |
| ORM | Prisma | Esquema declarativo, migraciones versionadas y tipos generados. |
| Imágenes | Cloudinary | Optimización y redimensión automáticas servidas por CDN. |
| Proxy y HTTPS | Caddy | Certificados automáticos y WebSockets sin configuración adicional. |
| Contenedores | Docker, Docker Compose | El mismo artefacto en local y en producción. |
| CI/CD | GitHub Actions, GHCR | Integrado con el repositorio; imágenes versionadas por commit. |
| Gestión | GitHub Issues, Projects y Milestones | Tareas, tablero y avance junto al código. |
| Documentación | Markdown y Mermaid en `docs/`, Swagger en `/api/docs` | Versionada con el código; el PDF se genera desde aquí. |

## Decisiones de arquitectura

| # | Decisión | Alternativa descartada | Motivo |
|---|---|---|---|
| D01 | Monolito modular | Microservicios | Complejidad operativa sin beneficio a esta escala. |
| D02 | Un dominio con rutas | Subdominios para web y API | Cookies del mismo sitio, sin CORS para el navegador. |
| D03 | Sesión en cookies `HttpOnly` con refresh rotado | JWT en localStorage | El token no queda expuesto a XSS. |
| D04 | Subida de imágenes a través del backend | Subida firmada directa | Más simple para un mes; la validación vive en un solo lugar. |
| D05 | Contadores desnormalizados en `posts` | `COUNT(*)` en cada consulta | Valor listo para emitir en vivo y feed sin agregaciones. |
| D06 | Imágenes construidas en CI y publicadas en GHCR | Compilar en el VPS | Lo que se despliega es lo que CI probó; permite volver atrás por etiqueta. |
| D07 | Caddy | Nginx con Certbot | HTTPS automático y menos configuración. |
| D08 | Eventos de dominio entre módulos | Llamadas directas al Gateway | Desacopla el trabajo de Dev 2 y Dev 3. |
| D09 | Sin contenido público | Perfiles públicos | Decisión del equipo; simplifica permisos y consultas. |
