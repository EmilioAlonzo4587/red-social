# Plan de trabajo

## Metodología

Kanban con entregas semanales. Cada semana es un milestone de GitHub con un objetivo verificable en producción, y el tablero de GitHub Projects muestra el estado de cada issue.

| Columna | Significado |
|---|---|
| Backlog | Issue creada, aún no lista para empezar |
| Ready | Sus dependencias están terminadas y alguien puede tomarla |
| In progress | Tiene responsable y rama abierta (máximo 2 por persona) |
| In review | Pull request abierto esperando revisión |
| Done | Mergeada y desplegada en producción |

**Rituales**: un mensaje diario corto en el grupo (qué hice, qué haré, qué me bloquea) y una revisión de 30 minutos al cierre de cada semana para comparar el milestone con lo desplegado. Las revisiones de código se hacen el mismo día en que se piden.

## Flujo de Git

- Ramas cortas desde `main` con el ID de la issue: `feat/S2-04-api-publicaciones`, `fix/S3-01-contador-comentarios`.
- Commits con el formato de Conventional Commits: `feat(posts): crear publicación con imágenes`.
- El pull request enlaza su issue con `Closes #<número>` y se integra con squash merge.
- Nadie hace push directo a `main`.

## Definición de terminado

Una issue está terminada cuando:

1. Su pull request tiene una aprobación y el CI en verde.
2. Está desplegada y funcionando en producción.
3. Sus endpoints están documentados en Swagger con sus respuestas de error.
4. Tiene una prueba del caso feliz y, cuando aplica, una del caso prohibido (por ejemplo, 403 al borrar algo ajeno).
5. Las variables nuevas están en `.env.example`.

## Cronograma

El proyecto arranca el miércoles 14 de octubre de 2026 a las 15:00, hora de Guatemala (UTC-6), y se cuenta en días naturales: el día 1 es el 14 de octubre y el día 30 el 12 de noviembre. Cada semana termina el día indicado a las 23:59, que es la fecha límite de su milestone en GitHub.

| Semana | Objetivo verificable | Dev 1 · Frontend | Dev 2 · Datos y contenido | Dev 3 · Plataforma y tiempo real |
|---|---|---|---|---|
| 0 · 14 al 16 oct (días 1-3) | Repo, esquema y servidor listos | Wireframes; Next.js inicializado | Esquema y migración; contrato de API | Monorepo y CI; VPS y dominio |
| 1 · 17 al 23 oct (días 4-10) | Registro e inicio de sesión en producción | Portada, login y registro; cliente de API; perfil | Usuarios y perfil; seed; eventos de dominio | Producción con HTTPS (19 oct); autenticación; e2e en CI; socket autenticado |
| 2 · 24 al 30 oct (días 11-17) | Publicar, seguir y like en vivo | Compositor; feed; likes y seguir; editar perfil | Publicaciones; feeds; seguimiento; likes | Cloudinary; respaldo diario; contador de likes en vivo |
| 3 · 31 oct al 6 nov (días 18-24) | Todas las funciones completas | Notificaciones; detalle y comentarios; buscador | Comentarios; búsqueda; notificaciones persistidas | API e interfaz de chat; envío en vivo |
| 4 · 7 al 12 nov (días 25-30) | Entrega | Funciones congeladas el 7 nov: pruebas, seguridad, documentación, restauración y ensayo de la demo | | |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| No conseguir un VPS gratuito a tiempo | Alta | Fecha límite el 16 oct y plan de pago |
| Problemas con WebSockets detrás del proxy | Media | Socket autenticado en producción en la semana 1 |
| Retraso de una persona bloquea a otra | Media | Contrato de API y eventos de dominio desde la semana 0 y 1 |
| Errores de último momento | Media | Funciones congeladas el 7 nov |
| Pérdida de datos en el VPS | Baja | Respaldo diario y restauración probada |

## Backlog

Generado desde `docs/plan/backlog.json`, la misma fuente que crea las issues en GitHub.

<!-- BACKLOG:INICIO (generado desde docs/plan/backlog.json; no editar a mano) -->

### Semana 0 (14 al 16 oct): Decidir y preparar

| Issue | Asignado | Criterios de aceptación |
|---|---|---|
| **S0-01** Monorepo y estructura base | Dev 3 · Plataforma y tiempo real | • Workspaces con apps/web, apps/api, packages/api-types, infra/ y docs/<br>• README con la estructura y cómo levantar el entorno local<br>• docker-compose.dev.yml levanta PostgreSQL local |
| **S0-02** CI en pull requests y protección de main<br><small>depende de S0-01</small> | Dev 3 · Plataforma y tiempo real | • ci.yml ejecuta lint, tsc --noEmit y build de web y api en cada PR<br>• main exige PR, 1 aprobación y CI en verde, sin excepciones para administradores |
| **S0-03** Conseguir el VPS y el dominio | Dev 3 · Plataforma y tiempo real | • Se intenta primero Student Pack o Azure for Students; si el 16 de octubre (día 3) no hay máquina, se paga un VPS barato<br>• Mínimo 2 GB de RAM y swap configurado<br>• Acceso SSH solo con llave, usuario sin root, firewall con 22, 80 y 443<br>• Docker instalado y el dominio apuntando a la IP |
| **S0-04** Esquema Prisma y migración inicial<br><small>depende de S0-01</small> | Dev 2 · Datos y contenido | • Prisma instalado en apps/api con el schema.prisma que ya está en apps/api/prisma/<br>• La migración incluye a mano las extensiones, CHECKs e índices parciales y GIN de docs/plan/schema_referencia.sql<br>• prisma migrate reset reconstruye la base desde cero sin errores |
| **S0-05** Contrato de API v0 | Dev 2 · Datos y contenido | • docs/05-api.md con endpoints, DTOs, códigos de error y eventos de socket<br>• Revisado y aprobado por los tres |
| **S0-06** Wireframes de las 8 vistas | Dev 1 · Frontend | • Portada con login, registro, feed, perfil, editar perfil, detalle de publicación, chat y notificaciones<br>• Incluye el buscador en la barra superior y los estados vacíos |
| **S0-07** Next.js inicializado con layout base<br><small>depende de S0-01</small> | Dev 1 · Frontend | • App Router con TypeScript, ESLint y librería de UI elegida<br>• Layout con barra superior y .env.example |

### Semana 1 (17 al 23 oct): Esqueleto en producción y autenticación

| Issue | Asignado | Criterios de aceptación |
|---|---|---|
| **S1-01** Esqueleto desplegado en producción<br><small>depende de S0-02, S0-03</small> | Dev 3 · Plataforma y tiempo real | • Caddy, web, api y PostgreSQL en Docker Compose; PostgreSQL sin puerto publicado<br>• HTTPS en el dominio; / sirve Next y /api/health responde<br>• Cada merge a main construye imágenes en GitHub Actions, las publica en GHCR, aplica prisma migrate deploy y reinicia los servicios<br>• Si /api/health falla después del deploy, se vuelve a la imagen anterior |
| **S1-02** API de autenticación con cookies y refresh rotado<br><small>HU01, HU02 · depende de S0-04</small> | Dev 3 · Plataforma y tiempo real | • register, login, logout, refresh y me<br>• Contraseñas con argon2id; cookies HttpOnly, Secure y SameSite=Lax<br>• Refresh token rotado y guardado con hash; reutilizar uno revocado cierra todas las sesiones<br>• Throttler en login y registro |
| **S1-03** Arnés de pruebas e2e en CI<br><small>depende de S0-02</small> | Dev 3 · Plataforma y tiempo real | • Jest y Supertest contra un PostgreSQL de servicio en GitHub Actions<br>• La base se migra y limpia por cada ejecución<br>• Primera prueba: /api/health contra la base real; las de registro, login y me llegan con S1-02<br>• docker build de api y web sin publicar en cada PR |
| **S1-04** Socket autenticado funcionando en producción<br><small>depende de S1-01, S1-02</small> | Dev 3 · Plataforma y tiempo real | • El Gateway valida la cookie en el handshake y rechaza conexiones sin sesión<br>• Cada usuario entra a la sala user:{id}<br>• Un evento de prueba llega al navegador a través de Caddy en producción |
| **S1-05** API de usuarios y perfil<br><small>HU04, HU05 · depende de S0-04</small> | Dev 2 · Datos y contenido | • GET /users/:username con contadores de seguidores, seguidos y publicaciones, e indicador de si lo sigo<br>• PATCH /users/me para nombre visible y biografía con límites de longitud<br>• Documentado en Swagger |
| **S1-06** Datos de demostración (seed)<br><small>depende de S0-04</small> | Dev 2 · Datos y contenido | • prisma db seed crea 20 usuarios, follows, publicaciones con imágenes de ejemplo, likes y comentarios<br>• Contadores coherentes con los datos insertados |
| **S1-07** Eventos de dominio entre módulos<br><small>depende de S0-05</small> | Dev 2 · Datos y contenido | • @nestjs/event-emitter configurado<br>• Eventos tipados like.changed, comment.changed, follow.created, message.created y notification.created<br>• Es el contrato entre los módulos de Dev 2 y el Gateway de Dev 3: los servicios no llaman al Gateway directamente |
| **S1-08** Portada, login y registro<br><small>HU01, HU02, HU03 · depende de S0-07</small> | Dev 1 · Frontend | • Portada prerenderizada con logo y acceso a login y registro<br>• El middleware de Next envía cualquier ruta privada a la portada si no hay sesión<br>• Errores de validación visibles junto a cada campo |
| **S1-09** Cliente de API tipado<br><small>depende de S1-02</small> | Dev 1 · Frontend | • Tipos generados desde /api/docs-json en packages/api-types<br>• En SSR, Next llama a http://api:3000 reenviando la cookie del usuario<br>• Un 401 intenta refresh una vez y, si falla, vuelve a la portada |
| **S1-10** Perfil renderizado en servidor<br><small>HU05 · depende de S1-05, S1-09</small> | Dev 1 · Frontend | • /u/[username] se renderiza en el servidor con los datos y contadores<br>• 404 si el usuario no existe |

### Semana 2 (24 al 30 oct): Núcleo social y primer contador en vivo

| Issue | Asignado | Criterios de aceptación |
|---|---|---|
| **S2-01** Subida y borrado de imágenes en Cloudinary<br><small>HU04, HU06 · depende de S1-02</small> | Dev 3 · Plataforma y tiempo real | • Endpoint protegido que acepta jpeg, png o webp de hasta 5 MB y devuelve public_id y dimensiones<br>• Al eliminar una publicación o cambiar el avatar se borra el archivo anterior en Cloudinary<br>• Credenciales solo en variables de entorno |
| **S2-02** Respaldo diario de la base<br><small>depende de S1-01</small> | Dev 3 · Plataforma y tiempo real | • pg_dump diario copiado fuera del VPS<br>• Se conservan los últimos 7 respaldos |
| **S2-03** Contador de likes en vivo de punta a punta<br><small>HU11 · depende de S1-04, S1-07, S2-07</small> | Dev 3 · Plataforma y tiempo real | • El cliente se suscribe a la sala post:{id} de las publicaciones visibles<br>• Al recibir like.changed, el Gateway emite el nuevo contador a esa sala<br>• Dos navegadores ven el mismo número sin recargar |
| **S2-04** API de publicaciones<br><small>HU06, HU07 · depende de S1-05, S2-01</small> | Dev 2 · Datos y contenido | • Crear con texto, hasta 4 imágenes o ambos; rechazar publicaciones vacías<br>• Eliminar solo las propias (403 si no), con borrado lógico<br>• GET /posts/:id |
| **S2-05** Feeds con paginación por cursor<br><small>HU08, HU05 · depende de S2-04</small> | Dev 2 · Datos y contenido | • /feed (seguidos y propios), /feed/explore (todas) y /users/:username/posts<br>• Paginación por cursor (created_at, id), sin OFFSET<br>• Cada publicación indica si ya le di like |
| **S2-06** API de seguimiento<br><small>HU09 · depende de S1-05</small> | Dev 2 · Datos y contenido | • Seguir y dejar de seguir de forma idempotente; no se permite seguirse a uno mismo<br>• Listas de seguidores y seguidos paginadas<br>• Emite follow.created |
| **S2-07** API de likes con contador transaccional<br><small>HU11 · depende de S2-04, S1-07</small> | Dev 2 · Datos y contenido | • Like y unlike idempotentes; el contador cambia en la misma transacción<br>• Emite like.changed con el contador nuevo<br>• Prueba: dos likes del mismo usuario cuentan uno |
| **S2-08** Compositor de publicaciones<br><small>HU06 · depende de S2-04</small> | Dev 1 · Frontend | • Texto con contador de caracteres e imágenes con vista previa, hasta 4<br>• Muestra el progreso de la subida y los errores de tamaño o tipo |
| **S2-09** Feed con pestañas Siguiendo y Explorar<br><small>HU08 · depende de S2-05</small> | Dev 1 · Frontend | • Scroll infinito con cursor<br>• Imágenes servidas por Cloudinary con tamaño y formato automáticos<br>• Estado vacío en Siguiendo que invita a Explorar o a buscar personas |
| **S2-10** Likes, seguir y eliminar en la interfaz<br><small>HU05, HU07, HU09, HU11 · depende de S2-06, S2-07, S1-10</small> | Dev 1 · Frontend | • Botón de like optimista que se corrige si la API falla<br>• Botón seguir en el perfil y lista de publicaciones del perfil<br>• Eliminar publicación propia con confirmación dentro de la página |
| **S2-11** Editar perfil y avatar<br><small>HU04 · depende de S1-05, S2-01</small> | Dev 1 · Frontend | • Formulario de nombre visible y biografía<br>• Cambio de avatar con vista previa |

### Semana 3 (31 oct al 6 nov): Comentarios, búsqueda, notificaciones y chat

| Issue | Asignado | Criterios de aceptación |
|---|---|---|
| **S3-01** API de comentarios<br><small>HU12 · depende de S2-04, S1-07</small> | Dev 2 · Datos y contenido | • Crear, listar paginado y borrar solo los propios<br>• comment_count cambia en la misma transacción<br>• Emite comment.changed con el contador nuevo |
| **S3-02** API de búsqueda de usuarios<br><small>HU10 · depende de S1-05</small> | Dev 2 · Datos y contenido | • GET /users/search?q= con mínimo 2 caracteres, usando los índices de trigramas<br>• Escapa % y _ del texto ingresado<br>• Máximo 20 resultados, primero los que empiezan con el texto |
| **S3-03** Notificaciones persistidas<br><small>HU13 · depende de S1-07, S2-06, S2-07, S3-01</small> | Dev 2 · Datos y contenido | • Un listener crea la notificación de like, comentario, seguimiento y mensaje; nunca para uno mismo<br>• GET /notifications paginado, GET /notifications/unread-count y marcar leídas (una o todas)<br>• Emite notification.created |
| **S3-04** API de chat<br><small>HU14 · depende de S1-02</small> | Dev 3 · Plataforma y tiempo real | • Abrir u obtener la conversación con un usuario (orden a < b)<br>• Bandeja ordenada por último mensaje, con no leídos por conversación<br>• Mensajes paginados por cursor y marcar como leído<br>• Solo los participantes pueden leer o escribir (403 si no) |
| **S3-05** Mensajes y notificaciones en vivo<br><small>HU13, HU14 · depende de S3-04, S3-03, S1-04</small> | Dev 3 · Plataforma y tiempo real | • Un mensaje nuevo llega a la sala conv:{id} y actualiza la bandeja del receptor en user:{id}<br>• Unirse a conv:{id} solo si el usuario participa<br>• notification.created se emite a user:{id} |
| **S3-06** Interfaz de chat<br><small>HU14 · depende de S3-04, S3-05</small> | Dev 3 · Plataforma y tiempo real | • Bandeja y vista de conversación con historial al subir<br>• Contador de no leídos en el menú<br>• Botón Mensaje en el perfil<br>• Dev 1 revisa el PR para mantener la consistencia visual |
| **S3-07** Campana y vista de notificaciones<br><small>HU13 · depende de S3-03, S3-05</small> | Dev 1 · Frontend | • Campana con contador que se actualiza en vivo<br>• Al llegar notification:new, además de subir el contador aparece una tarjeta breve (toast) que se desvanece sola a los pocos segundos (D10)<br>• Se abren en un panel vertical anclado al lado derecho, a la mitad del ancho de la pantalla, no en una página completa ni en un menú angosto (D10)<br>• Lista paginada dentro del panel que enlaza a la publicación, el perfil o el chat<br>• Marcar una o todas como leídas |
| **S3-08** Detalle de publicación con comentarios<br><small>HU12 · depende de S3-01, S2-03</small> | Dev 1 · Frontend | • /p/[id] renderizado en servidor con comentarios paginados<br>• Escribir y borrar comentarios propios<br>• Contador de comentarios en vivo en el feed y en el detalle |
| **S3-09** Buscador de usuarios<br><small>HU10 · depende de S3-02</small> | Dev 1 · Frontend | • Campo en la barra superior con espera de 300 ms entre teclas<br>• Resultados con avatar que enlazan al perfil |
| **S3-10** Lista de seguidores y seguidos<br><small>HU15 · depende de S2-06, S1-10</small> | Dev 1 · Frontend | • Al tocar "seguidores" o "seguidos" en el perfil se abre la lista correspondiente<br>• Cada fila con avatar, nombre visible y username, enlaza al perfil de esa persona<br>• Paginada por cursor con "Cargar más", igual que el feed<br>• Estado vacío cuando la lista no tiene elementos |
| **S3-11** Mostrar u ocultar la contraseña al escribirla | Dev 1 · Frontend | • Botón junto a cada campo de contraseña (login, registro) que alterna entre ocultarla y mostrarla en texto plano<br>• Accesible: aria-label describe la acción y el estado se anuncia (aria-pressed)<br>• No cambia la validación del campo ni se guarda la contraseña en ningún lado |
| **S3-12** Botón atrás no debe mostrar login ni datos de otra sesión | Dev 1 · Frontend | • Con sesión activa, la portada, el login y el registro redirigen a /feed (lo mismo que el proxy ya hace al revés sin sesión)<br>• Login y registro reemplazan la entrada del historial al redirigir tras el éxito (router.replace), no agregan una nueva<br>• Las páginas con datos de sesión se sirven con Cache-Control: no-store y fuerzan una recarga si el navegador las restaura desde su back-forward cache (evento pageshow con persisted)<br>• Probado con dos cuentas distintas en el mismo navegador: iniciar sesión con una, luego con la otra, y dar atrás no debe mostrar nunca los datos de la primera |
| **S3-13** Botón de cerrar sesión<br><small>HU02</small> | Dev 1 · Frontend | • Botón de texto "Cerrar sesión" (no un ícono suelto) fijo en la esquina inferior izquierda de la pantalla cuando hay sesión activa<br>• Llama a POST /api/auth/logout y redirige a la portada con una recarga completa (window.location.href), igual que ya hace el cliente de api cuando falla el refresh<br>• Funciona aunque el token de acceso ya haya vencido (el endpoint responde 204 siempre) |
| **S3-14** Barra lateral de navegación | Dev 1 · Frontend | • Barra vertical fija en el lado izquierdo, visible en pantallas anchas, con: Inicio (/feed), Notificaciones (abre el panel de S3-07), Mensajes (abre el panel de S3-06) y Mi perfil (tu propio /u/[username])<br>• No duplica el buscador (ya vive en la barra superior, S3-09) ni el botón de cerrar sesión (ya existe fijo en la esquina inferior izquierda, S3-13)<br>• Mientras S3-07 y S3-06 no existan, Notificaciones y Mensajes enlazan a sus páginas actuales en vez de abrir un panel<br>• Se oculta o colapsa en pantallas angostas (375 px) sin romper el contenido |
| **S3-15** Mostrar la foto de perfil real y poder verla más grande<br><small>HU04</small> | Dev 1 · Frontend | • Avatar muestra la foto real cuando existe avatarPublicId (publicaciones, encabezado del perfil y tu propia página de editar perfil), cayendo en iniciales solo si no hay foto<br>• Click en el avatar grande del perfil abre una vista ampliada (lightbox) de la foto<br>• Botón "Cancelar" junto a "Guardar cambios" en editar perfil, que descarta los cambios sin enviarlos y regresa al perfil<br>• En cada publicación, el avatar del autor también enlaza a su perfil, igual que ya hace su nombre |
| **S3-16** Íconos en la barra lateral<br><small>depende de S3-14</small> | Dev 1 · Frontend | • Cada ítem de la barra lateral (Inicio, Notificaciones, Mensajes, Mi perfil) tiene un ícono SVG junto al texto, como ya tiene el botón de cerrar sesión<br>• El ícono acompaña al texto, no lo reemplaza |
| **S3-17** Favicon de ChatInit | Dev 1 · Frontend | • Favicon propio de ChatInit en la pestaña del navegador, en vez del genérico de Next.js |
| **S3-18** Tarjeta de tu perfil en el panel derecho del inicio<br><small>HU04 · depende de S3-15</small> | Dev 1 · Frontend | • En /feed, en pantallas anchas, una columna a la derecha muestra la tarjeta de tu perfil: foto (Avatar con avatarPublicId, iniciales si no hay), nombre visible, @username y tu biografía actual<br>• Los datos salen de GET /api/auth/me, que /feed ya pide al montar (no agregar otra petición); si no hay biografía, un enlace "Agregar una biografía" a /perfil/editar<br>• La tarjeta enlaza a tu perfil (/u/[username]) y tiene un acceso a "Editar perfil"<br>• Aparece con una animación breve (fade o deslizamiento, menos de 300 ms) y respeta prefers-reduced-motion (sin animación si el usuario la desactivó)<br>• Mientras carga muestra un esqueleto del mismo tamaño, para que el feed no salte; si GET /api/auth/me falla, la columna no se muestra y el feed sigue funcionando<br>• Al guardar cambios en editar perfil, la tarjeta muestra los datos nuevos al volver a /feed<br>• Se oculta en pantallas angostas (375 px) sin romper el feed, igual que la barra lateral (S3-14)<br>• Convive con D10: cuando se abran los paneles de notificaciones (S3-07) o chat (S3-06), que van a la derecha, la tarjeta queda debajo del panel o se oculta, nunca encima |

### Semana 4 (7 al 12 nov): Funciones congeladas el 7 nov: pruebas, endurecimiento y entrega

| Issue | Asignado | Criterios de aceptación |
|---|---|---|
| **S4-01** Pruebas e2e de los flujos críticos<br><small>depende de S1-03</small> | Todos | • Dev 3: autenticación, refresh y chat entre dos usuarios<br>• Dev 2: publicar, like, comentar y notificación; permisos 403 en borrar y en chat ajeno<br>• Dev 1: prueba de humo con Playwright del recorrido principal (opcional) |
| **S4-02** Endurecimiento de seguridad | Dev 3 · Plataforma y tiempo real | • helmet, CORS limitado al dominio, ValidationPipe con whitelist y límite de tamaño del cuerpo<br>• Revisar que solo 80 y 443 estén expuestos<br>• Ningún secreto en el repositorio |
| **S4-03** Simulacro de restauración del respaldo<br><small>depende de S2-02</small> | Dev 3 · Plataforma y tiempo real | • Restaurar el último respaldo en una base limpia y verificar el conteo de registros<br>• Procedimiento documentado en docs/ |
| **S4-04** Swagger completo y revisado | Dev 2 · Datos y contenido | • Todos los endpoints con ejemplos y respuestas de error en /api/docs<br>• Autenticación por cookie documentada |
| **S4-05** README final de entrega | Dev 1 · Frontend | • Descripción, tecnologías, diagrama de arquitectura y ERD<br>• URLs del frontend, del backend y de /api/docs<br>• Variables de entorno y cómo levantar el proyecto localmente |
| **S4-06** Pase responsive y de accesibilidad | Dev 1 · Frontend | • Las 8 vistas funcionan a 375 px de ancho<br>• Foco visible y textos alternativos en imágenes |
| **S4-07** Ensayo de la demo en producción<br><small>depende de S4-01, S4-05</small> | Todos | • Recorrido completo con datos de demostración en el dominio real<br>• Lista de verificación de entrega revisada por los tres |

<!-- BACKLOG:FIN -->
