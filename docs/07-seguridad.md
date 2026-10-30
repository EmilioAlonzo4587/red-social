# Seguridad

| Riesgo | Medida | Dónde |
|---|---|---|
| Robo de contraseñas | Hash argon2id (`@node-rs/argon2`, 19 MiB y 2 pasadas); contraseña de 8 a 128 caracteres; la contraseña nunca se registra en logs | S1-02 |
| Descubrir qué cuentas existen | Login responde el mismo 401 y tarda lo mismo con un usuario inexistente: verifica contra un hash de relleno | S1-02 |
| Robo de token por XSS | Cookies `HttpOnly; Secure; SameSite=Lax`; token de acceso de 15 minutos | S1-02 |
| Reutilización de sesiones robadas | Token de renovación de 32 bytes aleatorios, guardado como SHA-256, rotado en cada uso y con la cookie limitada a `/api/auth`; reutilizar uno rotado revoca todas las sesiones | S1-02 |
| Ruta nueva sin protección | Guard de sesión global: toda ruta exige sesión salvo las marcadas con `@Public()` | S1-02 |
| CSRF | `SameSite=Lax`, mismo dominio y ningún cambio de estado por `GET` | S1-02 |
| Fuerza bruta | `@nestjs/throttler`: 5 intentos de login y 5 de registro por minuto por IP. La api confía en un salto de proxy (`trust proxy`, 1) para tomar la IP real de `X-Forwarded-For`, que Caddy reemplaza en cada petición; sin eso todos los visitantes compartirían la IP de Caddy | S1-02 |
| Acceso a recursos ajenos | Cada borrado o edición compara el autor con el usuario autenticado; prueba e2e del caso 403 | S2-04, S3-01, S3-04 |
| Sockets sin control | Sesión validada en el handshake con la misma regla que HTTP (`SessionTokenService`); el socket se cierra al vencer el JWT, así un logout o RN12 lo alcanza en 15 minutos como máximo; entrar a `conv:{id}` solo si participa | S1-04, S3-05 |
| WebSocket abierto desde otro sitio | El navegador no aplica CORS al WebSocket. Lo frena `SameSite=Lax` (la cookie no viaja) y, además, el handshake rechaza un `Origin` distinto de `CORS_ORIGIN`. Sin `Origin` (cliente que no es navegador o petición del mismo origen) decide la cookie | S1-04 |
| Entradas maliciosas | `ValidationPipe` global con `whitelist` y `forbidNonWhitelisted`; mismos límites en DTOs y en la base | Todas |
| Datos de una cuenta visibles tras cambiar de sesión en el mismo navegador | Portada, login y registro redirigen a `/feed` si ya hay sesión en vez de mostrarse; páginas con datos de sesión con `Cache-Control: no-store` y recarga forzada si el navegador las restaura desde su *back-forward cache* (evento `pageshow` con `persisted`) | S3-12 |
| Inyección SQL | Consultas por Prisma; el SQL manual usa parámetros, nunca concatenación | Todas |
| Archivos maliciosos | Solo jpeg, png y webp de hasta 5 MB. El filtro de la api mira el tipo declarado y Cloudinary revisa el contenido real con `allowed_formats` (un SVG o GIF renombrado responde 400) | S2-01, S2-03 |
| XSS | React escapa el contenido; prohibido `dangerouslySetInnerHTML` con datos de usuarios; cabeceras con `helmet` | S4-02 |
| CORS abierto | `CORS_ORIGIN` limitado al dominio de producción: en Socket.io desde S1-04 y en HTTP con S4-02 | S1-04, S4-02 |
| Base expuesta a internet | PostgreSQL sin puertos publicados; acceso solo por la red interna de Docker | S1-01 |
| Secretos filtrados | Solo en GitHub Secrets y en el `.env` del VPS; `.env` en `.gitignore`; `.env.example` sin valores reales | S0-01 |
| Dependencias con vulnerabilidades | `pnpm audit` en cada cambio de dependencias; los avisos revisados que no llegan a producción se listan con su motivo en `auditConfig.ignoreGhsas` de `pnpm-workspace.yaml` | Todas |
| Pérdida de datos | Respaldo diario fuera del servidor, cifrado con rclone crypt antes de salir del VPS, y restauración probada | S2-02, S4-03 |
