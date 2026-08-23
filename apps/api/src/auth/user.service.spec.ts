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

function makePrisma(overrides: { upsert?: unknown; pendingShare?: unknown } = {}) {
  return {
    user: {
      upsert: jest.fn().mockResolvedValue(overrides.upsert ?? { id: 'u1', email: 'a@b.com' }),
    },
    share: {
      findFirst: jest.fn().mockResolvedValue(overrides.pendingShare ?? null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  } as any;
}

describe('UserService.upsertFromClaims', () => {
  it('surfaces a P2002 email collision as a clear 409 AppError', async () => {
    const prisma = makePrisma();
    prisma.user.upsert.mockRejectedValue(p2002OnEmail());
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
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { supabaseSub: 'sub-1' },
        create: expect.objectContaining({ email: 'a@example.com' }),
        update: expect.objectContaining({ email: 'a@example.com' }),
      }),
    );
  });

  it('uses a single atomic upsert instead of a read-then-write', async () => {
    const prisma = makePrisma();
    const service = new UserService(prisma);
    await service.upsertFromClaims({ sub: 'sub-1', email: 'a@b.com' });
    expect(prisma.user.upsert).toHaveBeenCalledTimes(1);
  });

  it('reconciles pending shares when the email is verified and a pending share exists', async () => {
    const prisma = makePrisma({
      upsert: { id: 'u1', email: 'new@example.com' },
      pendingShare: { id: 'share-1' },
    });
    const service = new UserService(prisma);
    await service.upsertFromClaims({ sub: 'sub-1', email: 'new@example.com', email_verified: true });
    expect(prisma.share.findFirst).toHaveBeenCalledWith({
      where: { granteeEmail: 'new@example.com', granteeUserId: null },
      select: { id: true },
    });
    expect(prisma.share.updateMany).toHaveBeenCalledWith({
      where: { granteeEmail: 'new@example.com', granteeUserId: null },
      data: { granteeUserId: 'u1' },
    });
  });

  it('does not issue a reconciliation write when there is nothing pending', async () => {
    const prisma = makePrisma({
      upsert: { id: 'u1', email: 'new@example.com' },
      pendingShare: null,
    });
    const service = new UserService(prisma);
    await service.upsertFromClaims({ sub: 'sub-1', email: 'new@example.com', email_verified: true });
    expect(prisma.share.findFirst).toHaveBeenCalled();
    expect(prisma.share.updateMany).not.toHaveBeenCalled();
  });

  it('does not reconcile pending shares when the claims do not mark the email verified', async () => {
    const prisma = makePrisma({
      upsert: { id: 'u1', email: 'new@example.com' },
      pendingShare: { id: 'share-1' },
    });
    const service = new UserService(prisma);
    await service.upsertFromClaims({ sub: 'sub-1', email: 'new@example.com' });
    expect(prisma.share.findFirst).not.toHaveBeenCalled();
    expect(prisma.share.updateMany).not.toHaveBeenCalled();
  });

  it('does not reconcile pending shares when email_verified is present but not exactly true', async () => {
    const prisma = makePrisma({
      upsert: { id: 'u1', email: 'new@example.com' },
      pendingShare: { id: 'share-1' },
    });
    const service = new UserService(prisma);
    await service.upsertFromClaims({
      sub: 'sub-1',
      email: 'new@example.com',
      email_verified: 'true',
    } as any);
    expect(prisma.share.findFirst).not.toHaveBeenCalled();
    expect(prisma.share.updateMany).not.toHaveBeenCalled();
  });

  it('reconciles an already-existing user once their pending invite is found, even though the row was not just created', async () => {
    // This is the case the previous `!existing` gate permanently missed: a
    // user whose row already exists (created during an earlier, unverified
    // sign-in) must still be reconciled once they verify and something is
    // actually pending for them.
    const prisma = makePrisma({
      upsert: { id: 'u1', email: 'existing@example.com' },
      pendingShare: { id: 'share-1' },
    });
    const service = new UserService(prisma);
    await service.upsertFromClaims({
      sub: 'sub-1',
      email: 'existing@example.com',
      email_verified: true,
    });
    expect(prisma.share.updateMany).toHaveBeenCalledWith({
      where: { granteeEmail: 'existing@example.com', granteeUserId: null },
      data: { granteeUserId: 'u1' },
    });
  });
});
