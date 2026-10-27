import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request, { type Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import type { MeDto } from './../src/auth/dto/me.dto';
import type { ErrorResponseDto } from './../src/common/dto/error-response.dto';
import { configureApp } from './../src/configure-app';
import { PrismaService } from './../src/prisma/prisma.service';
import { cookiesOf } from './utils/cookies';
import { resetDatabase } from './utils/database';

const ana = {
  username: 'ana_lopez',
  email: 'ana@example.com',
  password: 'una-clave-larga',
};

// supertest deja el cuerpo como any: se le pone el tipo que promete el contrato
const meOf = (res: Response) => res.body as MeDto;
const errorOf = (res: Response) => res.body as ErrorResponseDto;
const ruleOf = (res: Response, field: string) =>
  errorOf(res).details.find((d) => d.field === field)?.rule;

describe('Autenticación (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  // Cada prueba usa otra IP (X-Forwarded-For, que Express lee por trust proxy) para que el
  // límite de 5 intentos por minuto no se cruce entre pruebas
  let ipCounter = 0;
  let ip: string;

  const register = (body: object) =>
    request(server)
      .post('/api/auth/register')
      .set('X-Forwarded-For', ip)
      .send(body);
  const login = (body: object) =>
    request(server)
      .post('/api/auth/login')
      .set('X-Forwarded-For', ip)
      .send(body);

  // Registra a Ana y devuelve sus dos cookies
  async function registerAna() {
    const res = await register(ana).expect(201);
    const cookies = cookiesOf(res);
    return {
      access: cookies.access_token.value,
      refresh: cookies.refresh_token.value,
    };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    ip = `10.0.0.${++ipCounter}`;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/auth/register', () => {
    it('201: crea la cuenta, inicia sesión y no devuelve el hash', async () => {
      const res = await register(ana).expect(201);

      // Exactamente los campos de Me: ni passwordHash ni nada más
      const me = meOf(res);
      expect(Object.keys(me).sort()).toEqual([
        'avatarPublicId',
        'bio',
        'createdAt',
        'displayName',
        'email',
        'id',
        'username',
      ]);
      expect(me).toMatchObject({
        username: 'ana_lopez',
        displayName: null,
        avatarPublicId: null,
        email: 'ana@example.com',
        bio: null,
      });

      const cookies = cookiesOf(res);
      expect(cookies.access_token.attributes).toMatch(/Path=\//);
      expect(cookies.access_token.attributes).toMatch(/HttpOnly/);
      expect(cookies.access_token.attributes).toMatch(/SameSite=Lax/);
      expect(cookies.refresh_token.attributes).toMatch(/Path=\/api\/auth/);
      expect(cookies.refresh_token.attributes).toMatch(/HttpOnly/);

      const user = await prisma.user.findUniqueOrThrow({
        where: { username: 'ana_lopez' },
      });
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    });

    it('400 con un detalle por campo inválido', async () => {
      const res = await register({
        username: 'a!',
        email: 'no-es-correo',
        password: 'corta',
      }).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, error: 'Bad Request' });
      expect(
        errorOf(res)
          .details.map((d) => d.field)
          .sort(),
      ).toEqual(['email', 'password', 'username']);
      expect(ruleOf(res, 'email')).toBe('isEmail');
      expect(ruleOf(res, 'password')).toBe('minLength');
    });

    it('400 con un campo que el DTO no declara', async () => {
      const res = await register({ ...ana, isAdmin: true }).expect(400);
      expect(errorOf(res).details).toEqual([
        { field: 'isAdmin', rule: 'whitelistValidation' },
      ]);
    });

    it('409 si el usuario ya existe, sin distinguir mayúsculas', async () => {
      await register(ana).expect(201);
      const res = await register({
        ...ana,
        username: 'ANA_LOPEZ',
        email: 'otra@example.com',
      }).expect(409);
      expect(res.body).toEqual({
        statusCode: 409,
        error: 'Conflict',
        message: 'username: ya está en uso',
        details: [{ field: 'username', rule: 'unique' }],
      });
    });

    it('409 si el correo ya existe', async () => {
      await register(ana).expect(201);
      const res = await register({
        ...ana,
        username: 'otra',
        email: 'ANA@example.com',
      }).expect(409);
      expect(errorOf(res).details).toEqual([
        { field: 'email', rule: 'unique' },
      ]);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await registerAna();
    });

    it('200 con el nombre de usuario', async () => {
      const res = await login({
        identifier: 'ana_lopez',
        password: ana.password,
      }).expect(200);
      expect(meOf(res).username).toBe('ana_lopez');
      expect(cookiesOf(res).access_token).toBeDefined();
    });

    it('200 con el correo, sin distinguir mayúsculas', async () => {
      await login({
        identifier: 'ANA@example.com',
        password: ana.password,
      }).expect(200);
    });

    it('el mismo 401 con contraseña incorrecta o usuario inexistente', async () => {
      const wrong = await login({
        identifier: 'ana_lopez',
        password: 'otra-clave',
      }).expect(401);
      const missing = await login({
        identifier: 'nadie',
        password: 'otra-clave',
      }).expect(401);
      expect(wrong.body).toEqual(missing.body);
      expect(wrong.body).toEqual({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Usuario o contraseña incorrectos',
        details: [],
      });
    });

    it('400 si falta un campo', async () => {
      const res = await login({ identifier: 'ana_lopez' }).expect(400);
      expect(errorOf(res).details.map((d) => d.field)).toEqual(['password']);
    });

    it('429 al sexto intento en un minuto desde la misma IP', async () => {
      for (let i = 0; i < 5; i++) {
        await login({ identifier: 'ana_lopez', password: 'otra-clave' }).expect(
          401,
        );
      }
      const res = await login({
        identifier: 'ana_lopez',
        password: ana.password,
      }).expect(429);
      expect(res.body).toMatchObject({ statusCode: 429, details: [] });

      // Otra IP no está bloqueada
      ip = '10.9.9.9';
      await login({ identifier: 'ana_lopez', password: ana.password }).expect(
        200,
      );
    });
  });

  describe('GET /api/auth/me', () => {
    it('200 con sesión', async () => {
      const { access } = await registerAna();
      const res = await request(server)
        .get('/api/auth/me')
        .set('Cookie', `access_token=${access}`)
        .expect(200);
      expect(meOf(res).email).toBe('ana@example.com');
    });

    it('401 sin cookie', async () => {
      const res = await request(server).get('/api/auth/me').expect(401);
      expect(res.body).toMatchObject({ statusCode: 401, details: [] });
    });

    it('401 con un token vencido o falso', async () => {
      const { access } = await registerAna();
      const { sub } = app.get(JwtService).decode<{ sub: string }>(access);
      const expired = await app
        .get(JwtService)
        .signAsync({ sub }, { expiresIn: -10 });
      await request(server)
        .get('/api/auth/me')
        .set('Cookie', `access_token=${expired}`)
        .expect(401);
      await request(server)
        .get('/api/auth/me')
        .set('Cookie', 'access_token=falso')
        .expect(401);
    });
  });

  describe('POST /api/auth/refresh', () => {
    const refresh = (token: string) =>
      request(server)
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${token}`);

    it('204 y rota el token: el viejo queda revocado y apunta al nuevo', async () => {
      const first = await registerAna();
      const res = await refresh(first.refresh).expect(204);
      const second = cookiesOf(res).refresh_token.value;
      expect(second).not.toBe(first.refresh);
      expect(cookiesOf(res).access_token).toBeDefined();

      const tokens = await prisma.refreshToken.findMany({
        orderBy: { createdAt: 'asc' },
      });
      expect(tokens).toHaveLength(2);
      expect(tokens[0].revokedAt).not.toBeNull();
      expect(tokens[0].replacedBy).toBe(tokens[1].id);
      expect(tokens[1].revokedAt).toBeNull();
    });

    it('reutilizar un token rotado cierra todas las sesiones (RN12)', async () => {
      const first = await registerAna();
      const res = await refresh(first.refresh).expect(204);
      const second = cookiesOf(res).refresh_token.value;

      // Alguien usa el token viejo: 401 y borra las cookies
      const reuse = await refresh(first.refresh).expect(401);
      expect(cookiesOf(reuse).refresh_token.value).toBe('');

      // El token nuevo, que era válido, también quedó revocado
      await refresh(second).expect(401);
      expect(
        await prisma.refreshToken.count({ where: { revokedAt: null } }),
      ).toBe(0);
    });

    it('401 sin cookie o con un token desconocido', async () => {
      await request(server).post('/api/auth/refresh').expect(401);
      await refresh('no-existe').expect(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('204, borra las cookies y el refresh deja de servir', async () => {
      const { refresh } = await registerAna();
      const res = await request(server)
        .post('/api/auth/logout')
        .set('Cookie', `refresh_token=${refresh}`)
        .expect(204);
      expect(cookiesOf(res).access_token.value).toBe('');
      expect(cookiesOf(res).refresh_token.value).toBe('');

      await request(server)
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${refresh}`)
        .expect(401);
    });

    it('204 aunque no haya sesión', async () => {
      await request(server).post('/api/auth/logout').expect(204);
    });
  });

  describe('Formato de error', () => {
    it('404 en una ruta que no existe', async () => {
      const res = await request(server).get('/api/no-existe').expect(404);
      expect(res.body).toMatchObject({
        statusCode: 404,
        error: 'Not Found',
        details: [],
      });
    });

    it('400 con un JSON mal formado', async () => {
      const res = await request(server)
        .post('/api/auth/login')
        .set('X-Forwarded-For', ip)
        .set('Content-Type', 'application/json')
        .send('{"identifier":')
        .expect(400);
      expect(errorOf(res)).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        details: [],
      });
    });
  });
});
