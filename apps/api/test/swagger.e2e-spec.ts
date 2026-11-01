import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { OpenAPIObject } from '@nestjs/swagger';
import { STATUS_CODES } from 'node:http';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { setupSwagger } from './../src/swagger';

// Revisa que /api/docs documente todas las rutas como pide S4-04: la cookie de sesión,
// el 401 de las rutas con sesión y un ejemplo con el formato único en cada error.
// Si alguien agrega una ruta sin documentar sus errores, esta prueba falla.

// Las únicas rutas con @Public() (las de auth funcionan sin access_token, docs/05-api.md)
const PUBLIC_OPERATIONS = [
  'POST /api/auth/register',
  'POST /api/auth/login',
  'POST /api/auth/refresh',
  'POST /api/auth/logout',
  'GET /api/health',
];

interface Operation {
  key: string;
  path: string;
  security?: Record<string, string[]>[];
  parameters?: { name: string; in: string }[];
  requestBody?: unknown;
  responses: Record<string, ResponseObject>;
}

interface ResponseObject {
  description?: string;
  content?: Record<
    string,
    {
      schema?: { $ref?: string };
      examples?: Record<string, { summary?: string; value?: unknown }>;
    }
  >;
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

function operationsOf(doc: OpenAPIObject): Operation[] {
  return Object.entries(doc.paths).flatMap(([path, item]) =>
    METHODS.filter((method) => item[method]).map(
      (method) =>
        ({
          ...item[method],
          key: `${method.toUpperCase()} ${path}`,
          path,
        }) as Operation,
    ),
  );
}

describe('Swagger en /api/docs (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let doc: OpenAPIObject;
  let operations: Operation[];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    setupSwagger(app);
    await app.init();
    server = app.getHttpServer();

    const res = await request(server).get('/api/docs-json').expect(200);
    doc = res.body as OpenAPIObject;
    operations = operationsOf(doc);
  });

  afterAll(async () => {
    await app.close();
  });

  it('sirve la página sin sesión', async () => {
    const res = await request(server).get('/api/docs').expect(200);
    expect(res.text).toContain('swagger');
  });

  it('documenta las dos cookies de sesión', () => {
    expect(doc.components?.securitySchemes).toEqual({
      access_token: expect.objectContaining({
        type: 'apiKey',
        in: 'cookie',
        name: 'access_token',
      }) as unknown,
      refresh_token: expect.objectContaining({
        type: 'apiKey',
        in: 'cookie',
        name: 'refresh_token',
      }) as unknown,
    });
    expect(doc.info.description).toContain('Autenticación por cookie');
  });

  it('las rutas públicas son exactamente las de @Public()', () => {
    const withoutSession = operations
      .filter((op) => !op.security?.some((s) => 'access_token' in s))
      .map((op) => op.key);
    expect(withoutSession.sort()).toEqual([...PUBLIC_OPERATIONS].sort());
  });

  it('cada ruta con sesión documenta su 401', () => {
    const missing = operations
      .filter((op) => !PUBLIC_OPERATIONS.includes(op.key))
      .filter((op) => !op.responses['401'])
      .map((op) => op.key);
    expect(missing).toEqual([]);
  });

  it('refresh y logout piden la cookie refresh_token', () => {
    for (const key of ['POST /api/auth/refresh', 'POST /api/auth/logout']) {
      const op = operations.find((o) => o.key === key);
      expect(op?.security).toEqual([{ refresh_token: [] }]);
    }
  });

  it('cada ruta tiene una respuesta 2xx con descripción', () => {
    const missing = operations
      .filter(
        (op) =>
          !Object.entries(op.responses).some(
            ([status, res]) => status.startsWith('2') && res.description,
          ),
      )
      .map((op) => op.key);
    expect(missing).toEqual([]);
  });

  it('cada error trae ErrorResponseDto y ejemplos con el formato único', () => {
    const problems: string[] = [];
    for (const op of operations) {
      for (const [status, res] of Object.entries(op.responses)) {
        const code = Number(status);
        if (code < 400 || op.key === 'GET /api/health') continue;

        const json = res.content?.['application/json'];
        if (!res.description)
          problems.push(`${op.key} ${status}: sin descripción`);
        if (json?.schema?.$ref !== '#/components/schemas/ErrorResponseDto') {
          problems.push(`${op.key} ${status}: sin ErrorResponseDto`);
        }
        const examples = Object.values(json?.examples ?? {});
        if (examples.length === 0)
          problems.push(`${op.key} ${status}: sin ejemplo`);
        for (const example of examples) {
          expect(example.value).toEqual({
            statusCode: code,
            error: STATUS_CODES[code],
            message: expect.any(String) as unknown,
            details: expect.any(Array) as unknown,
          });
          // details solo lleva elementos en un 400 (docs/05-api.md)
          const { details } = example.value as { details: unknown[] };
          if (code !== 400 && code !== 409 && details.length > 0) {
            problems.push(`${op.key} ${status}: details debe ser []`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('las rutas con :id, :username, ?cursor= o body documentan su 400 y su 404', () => {
    const problems: string[] = [];
    for (const op of operations) {
      const pathParams = (op.parameters ?? []).filter((p) => p.in === 'path');
      const hasCursor = (op.parameters ?? []).some((p) => p.name === 'cursor');
      const hasId = pathParams.some((p) => p.name === 'id');
      const hasUsername = pathParams.some((p) => p.name === 'username');

      if ((hasId || hasCursor || op.requestBody) && !op.responses['400']) {
        problems.push(`${op.key}: falta el 400`);
      }
      if ((hasId || hasUsername) && !op.responses['404']) {
        problems.push(`${op.key}: falta el 404`);
      }
    }
    expect(problems).toEqual([]);
  });
});
