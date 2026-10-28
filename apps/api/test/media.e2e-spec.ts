import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request, { type Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import type { ErrorResponseDto } from './../src/common/dto/error-response.dto';
import { configureApp } from './../src/configure-app';
import { CloudinaryService } from './../src/media/cloudinary.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { cookiesOf } from './utils/cookies';
import { resetDatabase } from './utils/database';

const ruleOf = (res: Response, field: string) =>
  (res.body as ErrorResponseDto).details.find((d) => d.field === field)?.rule;

// Cloudinary va simulado: las e2e no suben nada real, eso se probó a mano contra la
// cuenta de Cloudinary. Aquí se prueba el endpoint: validación, errores y el formato
// de la respuesta Media.
describe('Media (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  let ipCounter = 0;
  let ip: string;
  const cloudinary = {
    uploadImage: jest.fn(),
    deleteByPublicId: jest.fn(),
    belongsToUser: jest.fn(),
  };

  async function signUp(username: string) {
    const res = await request(server)
      .post('/api/auth/register')
      .set('X-Forwarded-For', ip)
      .send({
        username,
        email: `${username}@example.com`,
        password: 'una-clave-larga',
      })
      .expect(201);
    return { cookie: `access_token=${cookiesOf(res).access_token.value}` };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CloudinaryService)
      .useValue(cloudinary)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    ip = `10.0.2.${++ipCounter}`;
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/media', () => {
    it('201: sube la imagen a la carpeta del usuario y devuelve Media', async () => {
      const ana = await signUp('ana_lopez');
      cloudinary.uploadImage.mockResolvedValueOnce({
        publicId: 'users/u1/abc123',
        width: 1200,
        height: 800,
      });

      const res = await request(server)
        .post('/api/media')
        .set('Cookie', ana.cookie)
        .attach('file', Buffer.from('contenido-de-prueba'), {
          filename: 'foto.png',
          contentType: 'image/png',
        })
        .expect(201);

      expect(res.body).toEqual({
        publicId: 'users/u1/abc123',
        mediaType: 'image',
        width: 1200,
        height: 800,
      });
      expect(cloudinary.uploadImage).toHaveBeenCalledTimes(1);
    });

    it('400 si el archivo no es jpeg, png o webp', async () => {
      const ana = await signUp('ana_lopez');

      const res = await request(server)
        .post('/api/media')
        .set('Cookie', ana.cookie)
        .attach('file', Buffer.from('hola'), {
          filename: 'notas.txt',
          contentType: 'text/plain',
        })
        .expect(400);

      expect(ruleOf(res, 'file')).toBe('mimeType');
      expect(cloudinary.uploadImage).not.toHaveBeenCalled();
    });

    it('400 si falta el archivo', async () => {
      const ana = await signUp('ana_lopez');

      const res = await request(server)
        .post('/api/media')
        .set('Cookie', ana.cookie)
        .expect(400);

      expect(ruleOf(res, 'file')).toBe('required');
    });

    it('413 si el archivo pasa de 5 MB (RN03)', async () => {
      const ana = await signUp('ana_lopez');
      const big = Buffer.alloc(5 * 1024 * 1024 + 1);

      await request(server)
        .post('/api/media')
        .set('Cookie', ana.cookie)
        .attach('file', big, {
          filename: 'grande.jpg',
          contentType: 'image/jpeg',
        })
        .expect(413);

      expect(cloudinary.uploadImage).not.toHaveBeenCalled();
    });

    it('401 sin sesión', async () => {
      await request(server)
        .post('/api/media')
        .attach('file', Buffer.from('x'), {
          filename: 'foto.png',
          contentType: 'image/png',
        })
        .expect(401);
    });
  });
});
