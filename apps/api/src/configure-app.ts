import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { createValidationPipe } from './common/validation';

// Configuración global que comparten main.ts y las pruebas e2e, para que las pruebas
// vean la api igual que producción.
export function configureApp(app: NestExpressApplication): void {
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  // Detrás de Caddy, la conexión llega desde el contenedor de Caddy. Con 1 salto de confianza,
  // Express toma la IP del cliente de la cabecera X-Forwarded-For que pone Caddy (req.ip).
  // El throttler cuenta los intentos por esa IP.
  app.set('trust proxy', 1);

  // Lee la cabecera Cookie y deja las cookies en req.cookies
  app.use(cookieParser());

  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
}
