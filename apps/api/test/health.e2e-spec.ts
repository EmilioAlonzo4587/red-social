import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from './../src/prisma/prisma.service';

// Se simula PrismaService para poder provocar la caída de la base (503).
// La prueba contra la base real está en database.e2e-spec.ts.
describe('GET /api/health (e2e)', () => {
  let app: NestExpressApplication;
  const queryRaw = jest.fn();

  beforeEach(async () => {
    queryRaw.mockReset();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: queryRaw, $disconnect: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('200 con la base arriba', () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok', database: 'ok' });
  });

  it('503 con la base caída', () => {
    queryRaw.mockRejectedValue(new Error('sin conexión'));
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(503)
      .expect({ status: 'error', database: 'error' });
  });

  it('sin el prefijo /api no existe', () => {
    return request(app.getHttpServer() as App)
      .get('/health')
      .expect(404);
  });
});
