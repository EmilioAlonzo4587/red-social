import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request, { type Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import type { ErrorResponseDto } from './../src/common/dto/error-response.dto';
import { configureApp } from './../src/configure-app';
import { PrismaService } from './../src/prisma/prisma.service';
import type { UserSummaryDto } from './../src/users/dto/user-summary.dto';
import { cookiesOf } from './utils/cookies';
import { resetDatabase } from './utils/database';

const usersOf = (res: Response) => res.body as UserSummaryDto[];
const namesOf = (res: Response) => usersOf(res).map((u) => u.username);
const ruleOf = (res: Response, field: string) =>
  (res.body as ErrorResponseDto).details.find((d) => d.field === field)?.rule;

describe('Búsqueda de usuarios (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  // Otra IP por prueba para no cruzar el límite de 5 registros por minuto (ver auth.e2e-spec.ts)
  let ipCounter = 0;
  let ip: string;
  let cookie: string;

  // Usuarios directo en la base: la búsqueda no depende de cómo se registraron
  async function seedUsers(
    users: { username: string; displayName?: string }[],
  ) {
    await prisma.user.createMany({
      data: users.map((u) => ({
        username: u.username,
        displayName: u.displayName ?? null,
        email: `${u.username}@example.com`,
        passwordHash: 'no-se-usa',
      })),
    });
  }

  const search = (q: string) =>
    request(server).get('/api/users/search').query({ q }).set('Cookie', cookie);

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
    ip = `10.0.8.${++ipCounter}`;
    // Quien busca: su username no coincide con ninguna búsqueda de estas pruebas
    const res = await request(server)
      .post('/api/auth/register')
      .set('X-Forwarded-For', ip)
      .send({
        username: 'quien_busca',
        email: 'quien_busca@example.com',
        password: 'una-clave-larga',
      })
      .expect(201);
    cookie = `access_token=${cookiesOf(res).access_token.value}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('200: busca por username o displayName sin distinguir mayúsculas, con UserSummary', async () => {
    await seedUsers([
      { username: 'ana_lopez', displayName: 'Ana López' },
      { username: 'beto', displayName: 'Mariana Ruiz' },
      { username: 'carla' },
    ]);

    const res = await search('ANA').expect(200);

    expect(namesOf(res).sort()).toEqual(['ana_lopez', 'beto']);
    expect(Object.keys(usersOf(res)[0]).sort()).toEqual(
      ['avatarPublicId', 'displayName', 'id', 'username'].sort(),
    );
  });

  it('200: primero los que empiezan con el texto', async () => {
    await seedUsers([
      { username: 'zz_luis' },
      { username: 'luisa' },
      { username: 'aa_luis' },
      { username: 'otro', displayName: 'Luis Pérez' },
    ]);

    const res = await search('luis').expect(200);

    // Empiezan con "luis" (por username o displayName), ordenados por username; luego el resto
    expect(namesOf(res)).toEqual(['luisa', 'otro', 'aa_luis', 'zz_luis']);
  });

  it('200: % y _ se buscan como texto, no como comodines', async () => {
    await seedUsers([
      { username: 'a_b' },
      { username: 'axb' },
      { username: 'cien', displayName: '100% real' },
      { username: 'cero', displayName: '1000 real' },
    ]);

    expect(namesOf(await search('a_b').expect(200))).toEqual(['a_b']);
    expect(namesOf(await search('0% r').expect(200))).toEqual(['cien']);
  });

  it('200: como máximo 20 resultados (RN14)', async () => {
    await seedUsers(
      Array.from({ length: 25 }, (_, i) => ({
        username: `maria_${String(i).padStart(2, '0')}`,
      })),
    );

    const res = await search('maria').expect(200);
    expect(usersOf(res)).toHaveLength(20);
  });

  it('200: lista vacía si nadie coincide', async () => {
    const res = await search('nadie').expect(200);
    expect(usersOf(res)).toEqual([]);
  });

  it('400 si q tiene menos de 2 caracteres, sin contar espacios (RN14)', async () => {
    for (const q of ['a', '  a  ']) {
      const res = await search(q).expect(400);
      expect(ruleOf(res, 'q')).toBe('minLength');
    }
    const missing = await request(server)
      .get('/api/users/search')
      .set('Cookie', cookie)
      .expect(400);
    expect(ruleOf(missing, 'q')).toBeDefined();
  });

  it('401 sin sesión', async () => {
    await request(server)
      .get('/api/users/search')
      .query({ q: 'ana' })
      .expect(401);
  });
});
