import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from './../src/prisma/prisma.service';
import { resetDatabase } from './utils/database';

// Primera prueba contra la base real (S1-03): la del CI o la minired_test local.
describe('Base de pruebas (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health responde 200 con la base real', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok', database: 'ok' });
  });

  it('resetDatabase deja las tablas vacías', async () => {
    await prisma.user.create({
      data: {
        username: 'prueba',
        email: 'prueba@example.com',
        passwordHash: 'x',
      },
    });
    expect(await prisma.user.count()).toBe(1);

    await resetDatabase(prisma);

    expect(await prisma.user.count()).toBe(0);
  });
});
