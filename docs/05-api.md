# Contrato de la API

Versión 0, acordada al inicio del proyecto (issue S0-05). La referencia viva es Swagger en `https://<dominio>/api/docs`, y el JSON de OpenAPI en `/api/docs-json` genera los tipos del frontend (`packages/api-types`). Este documento fija la forma de cada objeto, petición y respuesta; Swagger debe coincidir con él.

## Convenciones

- Todas las rutas empiezan con `/api`. Formato JSON en `camelCase`.
- Autenticación por cookies `access_token` y `refresh_token` (`HttpOnly`, `Secure`, `SameSite=Lax`). Las rutas marcadas 🔒 responden 401 sin sesión o con el token de acceso vencido.
- Listas paginadas por cursor: la respuesta es un `Page<T>` con `items` y `nextCursor`; la siguiente página se pide con `?cursor=<nextCursor>`. Tamaño fijo de 20. `nextCursor` es `null` en la última página. El cursor es opaco: la web lo reenvía tal cual, sin leerlo ni armarlo.
- Fechas en ISO 8601 y UTC (`"2026-10-20T05:40:15.000Z"`). La web les da formato ("hace 5 min").
- Imágenes por su `publicId` de Cloudinary, nunca por URL. La web arma la URL con `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`.
- Un campo sin valor va como `null`, no se omite.
- Una respuesta sin cuerpo usa 204.
- Errores con un formato único:

```json
{ "statusCode": 400, "error": "Bad Request", "message": "content: máximo 2000 caracteres", "details": [ { "field": "content", "rule": "maxLength" } ] }
```

`details` siempre viene: en un 400 lleva un elemento por campo inválido y en los demás errores es `[]`.

| Código | Uso |
|---|---|
| 400 | Validación fallida |
| 401 | Sin sesión o sesión vencida |
| 403 | Autenticado pero sin permiso (por ejemplo, borrar algo ajeno) |
| 404 | Recurso inexistente o eliminado |
| 409 | Conflicto (usuario o correo ya registrado) |
| 413 | Archivo demasiado grande |
| 429 | Demasiados intentos |
| 503 | Sin conexión a la base (solo `/api/health`) |

## Objetos

Cada objeto se define una vez y los endpoints lo citan por su nombre. La notación es de TypeScript solo para leerla rápido; los tipos reales se generan desde Swagger (S1-09).

```ts
// Vista mínima de un usuario: autor de publicaciones y comentarios, actor de notificaciones,
// resultado de búsqueda y contacto del chat. La web muestra displayName y, si es null, username.
UserSummary  { id: string; username: string; displayName: string | null; avatarPublicId: string | null }

// El usuario con sesión: GET /auth/me, login, registro y PATCH /users/me
Me           = UserSummary & { email: string; bio: string | null; createdAt: string }

// Perfil de cualquier usuario, incluido uno mismo
Profile      = UserSummary & { bio: string | null; createdAt: string;
                               postCount: number; followerCount: number; followingCount: number;
                               isFollowing: boolean }   // false cuando es mi propio perfil

// width y height en píxeles; la api siempre los llena aunque la columna admita null
Media        { publicId: string; mediaType: "image"; width: number; height: number }

Post         { id: string; author: UserSummary; content: string | null;
               media: Media[];                 // en el orden de subida, máximo 4 (RN03)
               likeCount: number; commentCount: number;
               likedByMe: boolean; createdAt: string }

Comment      { id: string; postId: string; author: UserSummary; content: string; createdAt: string }

Notification { id: string; type: "like" | "comment" | "follow" | "message"; actor: UserSummary;
               postId: string | null;          // like y comment
               commentId: string | null;       // comment
               read: boolean; createdAt: string }

// Una fila de la bandeja, vista por el usuario con sesión
Conversation { id: string; otherUser: UserSummary; lastMessage: Message | null;
               unread: number }                // mensajes del otro posteriores a mi última lectura

Message      { id: string; conversationId: string; senderId: string; content: string; createdAt: string }

Page<T>      { items: T[]; nextCursor: string | null }
```

Lo que la web deduce sola y por eso no viaja en la respuesta:

- "¿Es mío?" (borrar publicación o comentario, burbuja propia en el chat): comparar `author.id` o `senderId` con el `id` de `Me`.
- El enlace de una notificación: `like` y `comment` llevan a `/p/{postId}`, `follow` a `/u/{actor.username}` y `message` abre el chat con `POST /api/conversations { username: actor.username }`.

## Endpoints

En la columna Body, `?` marca un campo opcional y `?cursor=` una lista paginada. Los errores 401 de las rutas 🔒 no se repiten en la tabla.

### Autenticación (S1-02)

| Método | Ruta | Body | Respuesta | Errores |
|---|---|---|---|---|
| POST | `/api/auth/register` | `{ username, email, password }` | 201 `Me` e inicia sesión | 400 (RN01, RN02), 409 con `details` en `username` o `email` y `rule: "unique"`, 429 (RN13) |
| POST | `/api/auth/login` | `{ identifier, password }` | 200 `Me` | 400 si falta un campo, 401, 429 (RN13) |
| POST | `/api/auth/refresh` | cookie `refresh_token` | 204 con cookies nuevas | 401 |
| POST | `/api/auth/logout` | cookie `refresh_token` | 204 y borra las cookies, siempre | |
| GET | `/api/auth/me` 🔒 | | `Me` | |

- Límites: `username` de 3 a 30 caracteres `[A-Za-z0-9_]`, `email` hasta 254 y `password` de 8 a 128 (RN01, RN02). Se recortan los espacios de `username`, `email` e `identifier`, no los de `password`.
- Cookies: `access_token` lleva un JWT que vence a los 15 minutos (`JWT_ACCESS_TTL`) y viaja a todo el sitio (`Path=/`); `refresh_token` es un valor aleatorio que solo viaja a `/api/auth` (`Path=/api/auth`). Las dos cookies duran 7 días (`REFRESH_TOKEN_TTL_DAYS`), así la web sabe que hay sesión aunque el JWT haya vencido. Cuando una ruta 🔒 responde 401, la web llama una vez a `refresh` y repite la petición; si `refresh` también responde 401, la sesión terminó.
- `refresh` y `logout` no llevan 🔒: funcionan con el token de acceso vencido. `logout` responde 204 aunque no haya sesión.
- `identifier` es el usuario o el correo: si contiene `@` se busca por correo, si no por usuario (un nombre de usuario no puede tener `@`, RN01).
- Login responde el mismo 401 si el usuario no existe o si la contraseña es incorrecta, para no revelar qué cuentas existen.
- Reutilizar un `refresh_token` ya rotado responde 401 y cierra todas las sesiones del usuario (RN12). Dos `refresh` al mismo tiempo con el mismo token cuentan como reutilización, así que la web hace uno a la vez, también entre pestañas.
- Un `refresh` que falla responde 401 y borra las dos cookies.

### Usuarios y seguimiento

| Método | Ruta | Body | Respuesta | Errores | Issue |
|---|---|---|---|---|---|
| GET | `/api/users/search` 🔒 | `?q=` | `UserSummary[]`, máximo 20 | 400 si `q` tiene menos de 2 caracteres (RN14) | S3-02 |
| GET | `/api/users/:username` 🔒 | | `Profile` | 404 | S1-05 |
| PATCH | `/api/users/me` 🔒 | `{ displayName?, bio?, avatarPublicId? }` | `Me` | 400 | S1-05, S2-01 |
| GET | `/api/users/:username/posts` 🔒 | `?cursor=` | `Page<Post>` | 404 | S2-05 |
| GET | `/api/users/:username/followers` 🔒 | `?cursor=` | `Page<UserSummary>` | 404 | S2-06 |
| GET | `/api/users/:username/following` 🔒 | `?cursor=` | `Page<UserSummary>` | 404 | S2-06 |
| PUT | `/api/users/:username/follow` 🔒 | | `{ isFollowing: true, followerCount }` | 400 al seguirse a sí mismo (RN06), 404 | S2-06 |
| DELETE | `/api/users/:username/follow` 🔒 | | `{ isFollowing: false, followerCount }` | 404 | S2-06 |

- Búsqueda: primero los usuarios cuyo `username` o `displayName` empieza con el texto (S3-02).
- `GET /users/:username` no distingue mayúsculas (`/users/ANA_LOPEZ` encuentra a `ana_lopez`) y responde el `username` como se registró. `postCount` no cuenta publicaciones eliminadas.
- `PATCH /users/me`: `displayName` hasta 80 caracteres y `bio` hasta 300, sin contar espacios al inicio y al final; un campo que no se envía no cambia, y enviar `null` o un texto vacío borra el valor. Cualquier otro campo (por ejemplo `username`) responde 400. `avatarPublicId` se acepta desde S2-01; antes responde 400. Para cambiar el avatar, la web sube la imagen con `POST /api/media` y manda aquí su `publicId`; el anterior se borra de Cloudinary (S2-01). `avatarPublicId: null` quita la foto. Un `avatarPublicId` que no es del usuario responde 400 (ver Imágenes).
- `followerCount` en la respuesta de seguir permite actualizar el perfil sin volver a pedirlo.

### Imágenes (S2-01)

| Método | Ruta | Body | Respuesta | Errores |
|---|---|---|---|---|
| POST | `/api/media` 🔒 | `multipart/form-data` con el campo `file` | 201 `Media` | 400 si no es jpeg, png o webp; 413 si pasa de 5 MB (RN03) |

- Cada imagen se sube a la carpeta del usuario, `users/{id}/`, que forma parte de su `publicId`.
- `POST /api/posts` y `PATCH /api/users/me` responden 400 si un `publicId` no empieza con `users/{id}/` del usuario con sesión. Así nadie usa ni hace borrar (RN04) la imagen de otra persona.

### Publicaciones, feed y likes

| Método | Ruta | Body | Respuesta | Errores | Issue |
|---|---|---|---|---|---|
| POST | `/api/posts` 🔒 | `{ content?, media?: { publicId, width, height }[] }` | 201 `Post` | 400 si está vacía, si `content` pasa de 2000 caracteres, si hay más de 4 imágenes (RN03) o si una imagen no es del usuario | S2-04 |
| GET | `/api/posts/:id` 🔒 | | `Post` | 404, también si fue eliminada | S2-04 |
| DELETE | `/api/posts/:id` 🔒 | | 204 | 403 si es ajena (RN04), 404 | S2-04 |
| GET | `/api/feed` 🔒 | `?cursor=` | `Page<Post>`: propias y de seguidos (RN10) | | S2-05 |
| GET | `/api/feed/explore` 🔒 | `?cursor=` | `Page<Post>`: todas (RN10) | | S2-05 |
| PUT | `/api/posts/:id/like` 🔒 | | `{ likeCount, likedByMe: true }` | 404 | S2-07 |
| DELETE | `/api/posts/:id/like` 🔒 | | `{ likeCount, likedByMe: false }` | 404 | S2-07 |

- Cada elemento de `media` es lo que devolvió `POST /api/media` (`publicId`, `width` y `height`, enteros positivos), en el orden en que se muestran. La api guarda las medidas para que la web reserve el espacio de la imagen.
- Like y unlike son idempotentes: repetirlos responde 200 con el mismo contador (RN05).

### Comentarios (S3-01)

| Método | Ruta | Body | Respuesta | Errores |
|---|---|---|---|---|
| GET | `/api/posts/:id/comments` 🔒 | `?cursor=` | `Page<Comment>`, del más antiguo al más reciente | 404 |
| POST | `/api/posts/:id/comments` 🔒 | `{ content }` | 201 `Comment` | 400 (RN07), 404 |
| DELETE | `/api/comments/:id` 🔒 | | 204 | 403 si es ajeno (RN04), 404 |

### Notificaciones (S3-03)

| Método | Ruta | Body | Respuesta | Errores |
|---|---|---|---|---|
| GET | `/api/notifications` 🔒 | `?cursor=` | `Page<Notification>`, de la más reciente a la más antigua | |
| GET | `/api/notifications/unread-count` 🔒 | | `{ count }` | |
| POST | `/api/notifications/read` 🔒 | `{ ids: string[] }` o `{ all: true }` | 204 | 400 |

- Se crea una notificación de `message` solo si no hay otra sin leer del mismo remitente, para no llenar la campana con cada mensaje de una conversación.

### Chat (S3-04)

| Método | Ruta | Body | Respuesta | Errores |
|---|---|---|---|---|
| POST | `/api/conversations` 🔒 | `{ username }` | `Conversation`: 201 si es nueva, 200 si ya existía | 400 consigo mismo, 404 |
| GET | `/api/conversations` 🔒 | | `Conversation[]`, ordenadas por último mensaje, máximo 50 | |
| GET | `/api/conversations/:id/messages` 🔒 | `?cursor=` | `Page<Message>`, del más reciente al más antiguo | 403 si no participa (RN09), 404 |
| POST | `/api/conversations/:id/messages` 🔒 | `{ content }` | 201 `Message` | 400 (RN09), 403, 404 |
| POST | `/api/conversations/:id/read` 🔒 | | 204 | 403, 404 |

- La bandeja solo muestra conversaciones con al menos un mensaje.
- El contador del menú es la suma de `unread` de la bandeja; después lo mantiene `conversation:updated`.
- Los mensajes llegan del más reciente al más antiguo para cargar el historial al subir; la web los invierte para mostrarlos.

### Salud (S1-01)

| Método | Ruta | Respuesta | Errores |
|---|---|---|---|
| GET | `/api/health` | `{ status: "ok", database: "ok" }` | 503 `{ status: "error", database: "error" }` si no hay conexión a la base |

## Eventos de Socket.io

La conexión se autentica con la misma cookie de sesión; sin ella el servidor la rechaza. Los datos usan los objetos de arriba.

| Dirección | Evento | Datos | Efecto |
|---|---|---|---|
| Cliente → servidor | `post:watch` | `{ postIds: string[] }` | Entra a las salas de las publicaciones en pantalla |
| Cliente → servidor | `post:unwatch` | `{ postIds: string[] }` | Sale de esas salas |
| Cliente → servidor | `conversation:join` | `{ conversationId }` | Entra a la sala si participa. Responde por acknowledgement: `{ ok: true }` o `{ ok: false, error: "forbidden" }` si no participa o no existe (RN09) |
| Servidor → cliente | `post:likes` | `{ postId, likeCount }` | Actualiza el contador de likes |
| Servidor → cliente | `post:comments` | `{ postId, commentCount }` | Actualiza el contador de comentarios |
| Servidor → cliente | `message:new` | `Message` | Agrega el mensaje a la conversación abierta |
| Servidor → cliente | `conversation:updated` | `Conversation`, vista por quien la recibe | Actualiza la fila de la bandeja (o la agrega si es nueva), la reordena y ajusta el contador del menú |
| Servidor → cliente | `notification:new` | `Notification` | Suma uno a la campana y la agrega a la lista |
