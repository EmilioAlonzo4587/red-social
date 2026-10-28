import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);

  const config = new DocumentBuilder()
    .setTitle('ChatInit API')
    .setVersion('0')
    // La sesión viaja en la cookie access_token (HttpOnly): Swagger la manda sola después del login.
    .addCookieAuth('access_token')
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, config),
    {
      jsonDocumentUrl: 'api/docs-json',
    },
  );

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
