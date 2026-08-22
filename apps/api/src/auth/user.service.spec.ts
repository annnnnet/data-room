import { Prisma } from '@prisma/client';
import { UserService } from './user.service';
import { AppError } from '../common/api-error';

function p2002OnEmail() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`email`)', {
    code: 'P2002',
    clientVersion: '6.19.3',
    meta: { target: ['email'] },
  });
}

describe('UserService.upsertFromClaims', () => {
  it('surfaces a P2002 email collision as a clear 409 AppError', async () => {
    const prisma = {
      user: {
        upsert: jest.fn().mockRejectedValue(p2002OnEmail()),
      },
    } as any;
    const service = new UserService(prisma);

    await expect(
      service.upsertFromClaims({ sub: 'sub-1', email: 'taken@example.com' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      status: 409,
    });

    try {
      await service.upsertFromClaims({ sub: 'sub-1', email: 'taken@example.com' });
      fail('expected upsertFromClaims to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).message).toMatch(/account.*taken@example\.com.*exists/i);
    }
  });
});
