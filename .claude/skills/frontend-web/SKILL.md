---
name: frontend-web
description: Reglas para trabajar en apps/web (Next.js 16 con App Router, React 19 y Tailwind 4): páginas, componentes, formularios, llamadas a la api, estados de carga y error, y sockets en el cliente. Úsala al crear o cambiar cualquier pantalla o componente de la web.
---

# Frontend web (Dev 1)

Lee primero `CLAUDE.md` en la raíz. Esta skill agrega las reglas de `apps/web`.

## Estado actual

- Páginas en `src/app/`: `/` (portada), `/login`, `/registro`, `/feed`, `/p/[id]`, `/u/[username]`, `/perfil/editar`, `/notificaciones`, `/chat`. Hoy muestran datos de ejemplo: son los wireframes.
- Componentes en `src/components/`: `avatar`, `navbar`, `post-card`.
- `src/proxy.ts` redirige a `/` si la ruta no está en `PUBLIC_PATHS` (`src/lib/public-paths.ts`) y no hay cookie `access_token`. Sin sesión solo se ve la portada, login y registro (D09); no agregues rutas públicas sin que lo pida una issue.
- Login y registro validan en el cliente pero todavía no llaman a la api: eso llega con el cliente de API (S1-09), que usa los endpoints de S1-02.
- Next 16 tiene cambios respecto a versiones anteriores (por ejemplo, `middleware.ts` ahora es `proxy.ts`). Ante la duda, consulta la documentación de Next 16 antes de escribir código de Next en lugar de copiar ejemplos de versiones viejas.

## Estructura y estilo

- Importa con el alias `@/` (`@/components/avatar`). Componentes con nombre en PascalCase, archivos en kebab-case, exportación con nombre.
- Server Components por defecto. Pon `"use client"` solo donde hay estado, eventos o sockets, y lo más abajo posible en el árbol.
- Estilos con Tailwind y los tokens del tema en `globals.css` (`border-border`, `bg-surface`, `text-primary`, `text-muted`). No metas colores sueltos si existe el token.
- Textos visibles en español. HTML semántico (`main`, `article`, `nav`, `button` para acciones, `Link` para navegar).
- `pnpm --filter web lint` y `pnpm --filter web typecheck` deben pasar.

## Formularios

Sigue el patrón de `src/app/login/page.tsx` y `src/app/registro/page.tsx`:

- `noValidate` en el `<form>` y una función `validate()` que devuelve un objeto de errores por campo.
- Cada campo con `<label htmlFor>`, `aria-invalid` cuando tiene error y el mensaje debajo del campo.
- Los límites del cliente son los mismos que los de la api (`docs/02-analisis.md`): usuario 3 a 30 con letras, números y `_` (RN01); contraseña mínimo 8 (RN02); publicación hasta 2000 caracteres y hasta 4 imágenes jpeg, png o webp de 5 MB (RN03); comentario 1 a 1000 sin contar espacios (RN07); mensaje 1 a 2000 (RN09); nombre visible 80 y biografía 300. Pon `maxLength` en el input y muestra el contador cuando el límite importa.
- La validación del cliente es para la experiencia de uso; la api valida de nuevo. Nunca la quites del servidor por tenerla aquí.
- Mientras se envía, desactiva el botón y muestra que está enviando, para evitar envíos dobles.
- Cuando la api responde 400, muestra cada error de `details[].field` junto a su campo; 409 en registro va junto a usuario o correo según el campo que traiga.

## Llamadas a la api

- Siempre a rutas relativas `/api/...` del mismo dominio (D02). En el servidor de Next usa `API_INTERNAL_URL`. No pongas URLs absolutas a mano.
- En local no hay Caddy: `/api/...` llegaría a Next (:3001) y no a la api (:3000). Por eso `next.config.ts` lleva un `rewrites()` que manda `/api/:path*` a `API_INTERNAL_URL` (se agrega en S1-09). En producción Caddy atiende `/api` antes de llegar a Next, así que el rewrite no interviene. Las cookies quedan en el mismo origen en ambos casos.
- La sesión vive en cookies `HttpOnly` (D03): el JavaScript no puede ni debe leer los tokens. Nunca guardes tokens ni datos de sesión en `localStorage` o `sessionStorage`. En `fetch` desde el cliente usa `credentials: "include"`.
- Centraliza las llamadas en un cliente en `src/lib/` que: reintente una vez tras `POST /api/auth/refresh` si recibe 401 y, si vuelve a fallar, mande a la portada `/` (S1-09, igual que `proxy.ts`); y convierta el error de la api (`{ statusCode, message, details }`) en un tipo conocido. Las páginas no repiten esa lógica.
- Usa los tipos de `@red/api-types` para peticiones y respuestas en lugar de declararlos en cada página. Los tipos locales de los wireframes (como `Post` en `post-card.tsx`) se reemplazan al conectar la api.
- Listas: paginación por cursor con `{ items, nextCursor }`; pide la siguiente página con `?cursor=` y deja de pedir cuando `nextCursor` es `null`.

## Estados y errores en pantalla

- Cada vista que carga datos tiene estado de carga, vacío y error. Usa `loading.tsx` y `error.tsx` del App Router donde aplique.
- 401 sin refresh posible lleva a la portada `/`; 403 muestra "No tienes permiso"; 404 usa `not-found`; 413 dice que la imagen pasa de 5 MB; 429 pide esperar un momento.
- No muestres al usuario mensajes técnicos ni trazas. No dejes `console.log` en el código.

## Seguridad

- Prohibido `dangerouslySetInnerHTML` con cualquier dato que venga de usuarios. Publicaciones, comentarios, biografías y mensajes se muestran como texto (React los escapa); para saltos de línea usa `whitespace-pre-line`, como en `post-card.tsx`.
- Los enlaces externos llevan `rel="noopener noreferrer"`. No construyas URLs con datos del usuario sin `encodeURIComponent`.
- Imágenes de Cloudinary con `next/image` y `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`; las sube el backend (D04), el navegador nunca recibe claves de Cloudinary.
- Solo las variables `NEXT_PUBLIC_*` llegan al navegador. No pongas secretos en ellas.

## Variables de entorno

- Next solo lee los `.env*` de `apps/web`, no el `.env` de la raíz. En local cada uno crea `apps/web/.env.local` con `API_INTERNAL_URL`, `NEXT_PUBLIC_APP_URL` y `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` (la sección Frontend de `.env.example`; la guía de inicio trae el comando). `apps/web/.gitignore` ya ignora `.env*`.
- Las `NEXT_PUBLIC_*` se escriben dentro del JavaScript al hacer `next build`, no al arrancar. En producción llegan como argumentos de build de la imagen (ver la skill `plataforma`); cambiarlas en el `.env` del VPS no tiene efecto hasta reconstruir la imagen.
- `API_INTERNAL_URL` se lee en el servidor al arrancar, así que esa sí puede venir del compose.

## Tiempo real

- El cliente de Socket.io se conecta al mismo dominio en `/socket.io` y se autentica con la cookie, sin pasar tokens a mano. En local el rewrite de Next no garantiza websockets, así que se conecta directo a `http://localhost:3000` (la cookie de `localhost` sirve en los dos puertos).
- Usa solo los eventos de `docs/05-api.md`: `post:watch` y `post:unwatch` con las publicaciones visibles, `conversation:join` al abrir un chat; escucha `post:likes`, `post:comments`, `message:new`, `conversation:updated` y `notification:new`.
- Quita los listeners y haz `unwatch` al desmontar el componente para no duplicar eventos.
