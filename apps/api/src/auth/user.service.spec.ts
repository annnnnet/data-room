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

function makePrisma(overrides: { findUnique?: unknown; create?: unknown; update?: unknown } = {}) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(overrides.findUnique ?? null),
      create: jest.fn().mockResolvedValue(overrides.create ?? { id: 'u1', email: 'a@b.com' }),
      update: jest.fn().mockResolvedValue(overrides.update ?? { id: 'u1', email: 'a@b.com' }),
    },
    share: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  } as any;
}

describe('UserService.upsertFromClaims', () => {
  it('surfaces a P2002 email collision as a clear 409 AppError', async () => {
    const prisma = makePrisma();
    prisma.user.create.mockRejectedValue(p2002OnEmail());
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

  it('lowercases the claimed email before writing it', async () => {
    const prisma = makePrisma();
    const service = new UserService(prisma);
    await service.upsertFromClaims({ sub: 'sub-1', email: 'A@Example.COM' });
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: 'a@example.com' }) }),
    );
  });

  it('reconciles pending shares for a brand-new user whose email the claims mark verified', async () => {
    const prisma = makePrisma({ create: { id: 'u1', email: 'new@example.com' } });
    const service = new UserService(prisma);
    await service.upsertFromClaims({ sub: 'sub-1', email: 'new@example.com', email_verified: true });
    expect(prisma.share.updateMany).toHaveBeenCalledWith({
      where: { granteeEmail: 'new@example.com', granteeUserId: null },
      data: { granteeUserId: 'u1' },
    });
  });

  it('does not reconcile pending shares when the claims do not mark the email verified', async () => {
    const prisma = makePrisma({ create: { id: 'u1', email: 'new@example.com' } });
    const service = new UserService(prisma);
    await service.upsertFromClaims({ sub: 'sub-1', email: 'new@example.com' });
    expect(prisma.share.updateMany).not.toHaveBeenCalled();
  });

  it('does not reconcile pending shares when email_verified is present but not exactly true', async () => {
    const prisma = makePrisma({ create: { id: 'u1', email: 'new@example.com' } });
    const service = new UserService(prisma);
    await service.upsertFromClaims({
      sub: 'sub-1',
      email: 'new@example.com',
      email_verified: 'true',
    } as any);
    expect(prisma.share.updateMany).not.toHaveBeenCalled();
  });

  it('does not reconcile pending shares for an already-existing user, even with a verified email', async () => {
    const prisma = makePrisma({
      findUnique: { id: 'u1', email: 'existing@example.com' },
      update: { id: 'u1', email: 'existing@example.com' },
    });
    const service = new UserService(prisma);
    await service.upsertFromClaims({
      sub: 'sub-1',
      email: 'existing@example.com',
      email_verified: true,
    });
    expect(prisma.user.update).toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.share.updateMany).not.toHaveBeenCalled();
  });
});
