import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const queryRaw = jest.fn();
  const res = { status: jest.fn() };
  let controller: HealthController;

  beforeEach(async () => {
    queryRaw.mockReset();
    res.status.mockReset();
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: { $queryRaw: queryRaw } },
      ],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('responde ok si la base contesta', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    await expect(controller.check(res as unknown as Response)).resolves.toEqual(
      { status: 'ok', database: 'ok' },
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  it('responde 503 si la base no contesta', async () => {
    queryRaw.mockRejectedValue(new Error('sin conexión'));
    await expect(controller.check(res as unknown as Response)).resolves.toEqual(
      { status: 'error', database: 'error' },
    );
    expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
