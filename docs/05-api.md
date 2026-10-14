# Contrato de la API

Versión 0, acordada al inicio del proyecto (issue S0-05). La referencia viva es Swagger en `https://<dominio>/api/docs`, y el JSON de OpenAPI en `/api/docs-json` genera los tipos del frontend (`packages/api-types`).

## Convenciones

- Todas las rutas empiezan con `/api`. Formato JSON en `camelCase`.
- Autenticación por cookies `access_token` y `refresh_token` (`HttpOnly`, `Secure`, `SameSite=Lax`). Las rutas marcadas 🔒 responden 401 sin sesión.
- Listas paginadas por cursor: la respuesta trae `items` y `nextCursor`; la siguiente página se pide con `?cursor=<nextCursor>`. Tamaño fijo de 20.
- Errores con un formato único:

```json
{ "statusCode": 400, "error": "Bad Request", "message": "content: máximo 2000 caracteres", "details": [ { "field": "content", "rule": "maxLength" } ] }
```

| Código | Uso |
|---|---|
| 400 | Validación fallida |
| 401 | Sin sesión o sesión vencida |
| 403 | Autenticado pero sin permiso (por ejemplo, borrar algo ajeno) |
| 404 | Recurso inexistente o eliminado |
| 409 | Conflicto (usuario o correo ya registrado) |
| 413 | Archivo demasiado grande |
| 429 | Demasiados intentos |

## Endpoints

| Método | Ruta | Descripción | Issue |
|---|---|---|---|
| GET | `/api/health` | Estado de la API y de la conexión a la base | S1-01 |
| POST | `/api/auth/register` | Registro; inicia sesión | S1-02 |
| POST | `/api/auth/login` | Inicio de sesión (5 por minuto por IP) | S1-02 |
| POST | `/api/auth/refresh` | Rota el token de renovación | S1-02 |
| POST | `/api/auth/logout` 🔒 | Revoca la sesión actual | S1-02 |
| GET | `/api/auth/me` 🔒 | Usuario autenticado | S1-02 |
| GET | `/api/users/search?q=` 🔒 | Búsqueda por fragmento (mín. 2 caracteres) | S3-02 |
| GET | `/api/users/:username` 🔒 | Perfil con contadores e indicador de seguimiento | S1-05 |
| PATCH | `/api/users/me` 🔒 | Nombre visible, biografía, `avatarPublicId` | S1-05 |
| GET | `/api/users/:username/posts` 🔒 | Publicaciones del usuario | S2-05 |
| GET | `/api/users/:username/followers` 🔒 | Seguidores | S2-06 |
| GET | `/api/users/:username/following` 🔒 | Seguidos | S2-06 |
| PUT | `/api/users/:username/follow` 🔒 | Seguir (idempotente) | S2-06 |
| DELETE | `/api/users/:username/follow` 🔒 | Dejar de seguir | S2-06 |
| POST | `/api/media` 🔒 | Sube una imagen (multipart, ≤ 5 MB) y devuelve `publicId`, `width`, `height` | S2-01 |
| POST | `/api/posts` 🔒 | Crea una publicación `{ content?, media?: [publicId] }` | S2-04 |
| GET | `/api/posts/:id` 🔒 | Detalle | S2-04 |
| DELETE | `/api/posts/:id` 🔒 | Elimina una publicación propia | S2-04 |
| GET | `/api/feed` 🔒 | Pestaña Siguiendo | S2-05 |
| GET | `/api/feed/explore` 🔒 | Pestaña Explorar | S2-05 |
| PUT | `/api/posts/:id/like` 🔒 | Da like (idempotente); devuelve `likeCount` | S2-07 |
| DELETE | `/api/posts/:id/like` 🔒 | Quita el like | S2-07 |
| GET | `/api/posts/:id/comments` 🔒 | Comentarios paginados | S3-01 |
| POST | `/api/posts/:id/comments` 🔒 | Comenta | S3-01 |
| DELETE | `/api/comments/:id` 🔒 | Borra un comentario propio | S3-01 |
| GET | `/api/notifications` 🔒 | Notificaciones paginadas | S3-03 |
| GET | `/api/notifications/unread-count` 🔒 | Contador de no leídas | S3-03 |
| POST | `/api/notifications/read` 🔒 | Marca leídas `{ ids }` o `{ all: true }` | S3-03 |
| POST | `/api/conversations` 🔒 | Abre u obtiene la conversación con `{ username }` | S3-04 |
| GET | `/api/conversations` 🔒 | Bandeja con no leídos | S3-04 |
| GET | `/api/conversations/:id/messages` 🔒 | Historial paginado | S3-04 |
| POST | `/api/conversations/:id/messages` 🔒 | Envía un mensaje | S3-04 |
| POST | `/api/conversations/:id/read` 🔒 | Marca la conversación como leída | S3-04 |

## Eventos de Socket.io

La conexión se autentica con la misma cookie de sesión; sin ella el servidor la rechaza.

| Dirección | Evento | Datos | Efecto |
|---|---|---|---|
| Cliente → servidor | `post:watch` | `{ postIds: string[] }` | Entra a las salas de las publicaciones en pantalla |
| Cliente → servidor | `post:unwatch` | `{ postIds: string[] }` | Sale de esas salas |
| Cliente → servidor | `conversation:join` | `{ conversationId }` | Entra a la sala si participa; si no, recibe un error |
| Servidor → cliente | `post:likes` | `{ postId, likeCount }` | Actualiza el contador de likes |
| Servidor → cliente | `post:comments` | `{ postId, commentCount }` | Actualiza el contador de comentarios |
| Servidor → cliente | `message:new` | mensaje completo | Agrega el mensaje a la conversación abierta |
| Servidor → cliente | `conversation:updated` | `{ conversationId, lastMessageAt, unread }` | Reordena la bandeja y el contador del menú |
| Servidor → cliente | `notification:new` | notificación completa | Suma uno a la campana y la agrega a la lista |
