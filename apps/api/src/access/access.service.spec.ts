import { AccessService } from './access.service';
import { AppError } from '../common/api-error';

const NODE = {
  id: 'leaf',
  dataRoomId: 'room',
  path: '/root/mid/leaf/',
  deletedAt: null as Date | null,
  dataRoom: { ownerId: 'owner-1' },
};

function serviceWith(node: any, shares: any[]) {
  const prisma: any = {
    node: { findUnique: jest.fn().mockResolvedValue(node) },
    share: { findMany: jest.fn().mockResolvedValue(shares) },
  };
  return { svc: new AccessService(prisma), prisma };
}

describe('AccessService.resolve', () => {
  it('grants OWNER to the data room owner', async () => {
    const { svc } = serviceWith(NODE, []);
    await expect(svc.resolve({ kind: 'user', userId: 'owner-1' }, 'leaf')).resolves.toMatchObject({
      role: 'OWNER',
    });
  });

  it('grants VIEWER on a direct user share', async () => {
    const { svc } = serviceWith(NODE, [{ nodeId: 'leaf', role: 'VIEWER', granteeUserId: 'u2' }]);
    await expect(svc.resolve({ kind: 'user', userId: 'u2' }, 'leaf')).resolves.toMatchObject({
      role: 'VIEWER',
    });
  });

  it('grants VIEWER on a share inherited from an ancestor', async () => {
    const { svc } = serviceWith(NODE, [{ nodeId: 'mid', role: 'VIEWER', granteeUserId: 'u2' }]);
    await expect(svc.resolve({ kind: 'user', userId: 'u2' }, 'leaf')).resolves.toMatchObject({
      role: 'VIEWER',
    });
  });

  it('queries the node and every ancestor id', async () => {
    const { svc, prisma } = serviceWith(NODE, []);
    await svc.resolve({ kind: 'user', userId: 'u2' }, 'leaf').catch(() => undefined);
    expect(prisma.share.findMany.mock.calls[0][0].where.nodeId.in).toEqual(['root', 'mid', 'leaf']);
  });

  it('grants VIEWER to a matching link token', async () => {
    const { svc } = serviceWith(NODE, [{ nodeId: 'root', role: 'VIEWER', token: 'tok' }]);
    await expect(svc.resolve({ kind: 'link', shareToken: 'tok' }, 'leaf')).resolves.toMatchObject({
      role: 'VIEWER',
    });
  });

  it('returns 404 — not 403 — to a stranger', async () => {
    const { svc } = serviceWith(NODE, []);
    await expect(svc.resolve({ kind: 'user', userId: 'nobody' }, 'leaf')).rejects.toMatchObject({
      code: 'NODE_NOT_FOUND',
      status: 404,
    });
  });

  it('returns 404 to an anonymous caller', async () => {
    const { svc } = serviceWith(NODE, []);
    await expect(svc.resolve({ kind: 'anonymous' }, 'leaf')).rejects.toMatchObject({
      code: 'NODE_NOT_FOUND',
    });
  });

  it('returns 404 when the node does not exist at all', async () => {
    const { svc } = serviceWith(null, []);
    await expect(svc.resolve({ kind: 'user', userId: 'owner-1' }, 'leaf')).rejects.toMatchObject({
      code: 'NODE_NOT_FOUND',
    });
  });

  it('returns 410 GONE when a soft-deleted node was accessible', async () => {
    const { svc } = serviceWith({ ...NODE, deletedAt: new Date() }, []);
    await expect(svc.resolve({ kind: 'user', userId: 'owner-1' }, 'leaf')).rejects.toMatchObject({
      code: 'NODE_GONE',
      status: 410,
    });
  });

  it('excludes revoked and expired shares in the query filter', async () => {
    const { svc, prisma } = serviceWith(NODE, []);
    await svc.resolve({ kind: 'link', shareToken: 'tok' }, 'leaf').catch(() => undefined);
    const where = prisma.share.findMany.mock.calls[0][0].where;
    expect(where.revokedAt).toBeNull();
    expect(where.OR).toEqual([{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }]);
  });
});

describe('AccessService.requireOwner', () => {
  it('lets the owner through', async () => {
    const { svc } = serviceWith(NODE, []);
    await expect(svc.requireOwner({ kind: 'user', userId: 'owner-1' }, 'leaf')).resolves.toBeTruthy();
  });

  it('rejects a viewer with 403 FORBIDDEN', async () => {
    const { svc } = serviceWith(NODE, [{ nodeId: 'leaf', role: 'VIEWER', granteeUserId: 'u2' }]);
    await expect(svc.requireOwner({ kind: 'user', userId: 'u2' }, 'leaf')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });
  });
});
