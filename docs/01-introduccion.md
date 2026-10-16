# Introducción

## Descripción

ChatInit es una red social web desplegada en producción. Los usuarios se registran, publican texto e imágenes, siguen a otras personas, reaccionan y comentan, conversan por chat privado y reciben notificaciones en tiempo real.

El proyecto demuestra el desarrollo, la integración y el despliegue de una aplicación web moderna: autenticación segura, renderizado del lado del servidor, una API REST documentada con OpenAPI, comunicación en tiempo real, contenedores y despliegue continuo en un servidor propio.

## Objetivos

1. Entregar una aplicación cliente-servidor con frontend y backend separados y desplegados públicamente con HTTPS.
2. Persistir los datos en PostgreSQL con migraciones reproducibles.
3. Implementar funciones en tiempo real: contadores de likes y comentarios en vivo, notificaciones instantáneas y chat entre usuarios.
4. Documentar la API en una ruta pública (`/api/docs`) y el sistema completo en este documento.
5. Trabajar con integración y despliegue continuos desde la primera semana, con la rama `main` protegida.

## Alcance

| Incluido | Fuera de alcance |
|---|---|
| Registro, inicio y cierre de sesión con contraseñas cifradas | Recuperación de contraseña por correo |
| Perfil con nombre visible, biografía y foto | Cuentas o publicaciones privadas |
| Publicaciones con texto, hasta 4 imágenes o ambos; eliminación de las propias | Video en la interfaz |
| Likes, comentarios y seguimiento de usuarios | Chats grupales |
| Feed con pestañas Siguiendo y Explorar | Indicador de "escribiendo" y confirmación de lectura por mensaje |
| Búsqueda de usuarios | Varias instancias del backend (requiere Redis) |
| Notificaciones en vivo y persistidas | Contenido visible sin sesión |
| Chat 1 a 1 en tiempo real | |

Un visitante sin sesión solo ve la portada con el acceso al inicio de sesión y al registro. Todo el contenido requiere una cuenta.

## Equipo y roles

El equipo se organiza por dominios: cada integrante es dueño de un área y responde por su calidad, y todos revisan el código de los demás.

| Rol | Responsabilidades |
|---|---|
| **Dev 1 · Frontend** | Arquitectura de Next.js, sistema de interfaz, vistas, renderizado en servidor, cliente de API, campana de notificaciones. Revisa toda la interfaz del proyecto. |
| **Dev 2 · Datos y contenido** | Modelo de datos, migraciones, datos de prueba, API de usuarios, publicaciones, feed, likes, comentarios, seguimiento, búsqueda y notificaciones. Mantiene Swagger. |
| **Dev 3 · Plataforma y tiempo real** | Monorepo, CI/CD, VPS, Docker, autenticación, Gateway de WebSockets, chat (API e interfaz), imágenes en Cloudinary, respaldos y seguridad. |

El despliegue no tiene un responsable único en el día a día: cada merge a `main` se despliega automáticamente, y Dev 3 mantiene el pipeline que lo hace.
