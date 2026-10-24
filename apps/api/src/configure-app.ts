import { INestApplication } from '@nestjs/common';

// Configuración global que comparten main.ts y las pruebas e2e, para que las pruebas
// vean la api igual que producción. Aquí irán después ValidationPipe, cookie-parser, etc.
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
}
