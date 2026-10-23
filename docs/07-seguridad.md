# Seguridad

| Riesgo | Medida | Dónde |
|---|---|---|
| Robo de contraseñas | Hash argon2id; la contraseña nunca se registra en logs | S1-02 |
| Robo de token por XSS | Cookies `HttpOnly; Secure; SameSite=Lax`; token de acceso de 15 minutos | S1-02 |
| Reutilización de sesiones robadas | Token de renovación rotado en cada uso y guardado con hash; reutilizar uno rotado revoca todas las sesiones | S1-02 |
| CSRF | `SameSite=Lax`, mismo dominio y ningún cambio de estado por `GET` | S1-02 |
| Fuerza bruta | `@nestjs/throttler`: 5 intentos de login y 5 de registro por minuto por IP | S1-02 |
| Acceso a recursos ajenos | Cada borrado o edición compara el autor con el usuario autenticado; prueba e2e del caso 403 | S2-04, S3-01, S3-04 |
| Sockets sin control | Sesión validada en el handshake; entrar a `conv:{id}` solo si participa | S1-04, S3-05 |
| Entradas maliciosas | `ValidationPipe` global con `whitelist` y `forbidNonWhitelisted`; mismos límites en DTOs y en la base | Todas |
| Inyección SQL | Consultas por Prisma; el SQL manual usa parámetros, nunca concatenación | Todas |
| Archivos maliciosos | Solo jpeg, png y webp de hasta 5 MB; Cloudinary verifica el formato real | S2-01 |
| XSS | React escapa el contenido; prohibido `dangerouslySetInnerHTML` con datos de usuarios; cabeceras con `helmet` | S4-02 |
| CORS abierto | `CORS_ORIGIN` limitado al dominio de producción | S4-02 |
| Base expuesta a internet | PostgreSQL sin puertos publicados; acceso solo por la red interna de Docker | S1-01 |
| Secretos filtrados | Solo en GitHub Secrets y en el `.env` del VPS; `.env` en `.gitignore`; `.env.example` sin valores reales | S0-01 |
| Dependencias con vulnerabilidades | `pnpm audit` en cada cambio de dependencias; los avisos revisados que no llegan a producción se listan con su motivo en `auditConfig.ignoreGhsas` de `pnpm-workspace.yaml` | Todas |
| Pérdida de datos | Respaldo diario fuera del servidor y restauración probada | S2-02, S4-03 |
