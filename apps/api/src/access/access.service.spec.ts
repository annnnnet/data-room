import { AccessService } from './access.service';

const NODE = {
  id: 'leaf',
  dataRoomId: 'room',
  path: '/root/mid/leaf/',
  parentId: 'mid',
  type: 'FILE' as const,
  name: 'leaf.txt',
  deletedAt: null as Date | null,
  dataRoom: { ownerId: 'owner-1' },
};

type ShareRow = {
  nodeId: string;
  role?: string;
  granteeUserId?: string;
  token?: string;
  revokedAt?: Date | null;
  expiresAt?: Date | null;
};

/**
 * A filter-honouring fake: unlike a mock that returns `shares`
 * unconditionally, this actually applies the `where` clause the service
 * builds to an in-memory array of share rows. It only supports the shapes
 * this service produces (nodeId.in, revokedAt, expiresAt OR-clause,
 * granteeUserId/token), but that's the point — it proves the query filter
 * is load-bearing, not just present.
 */
function findManyFake(rows: ShareRow[]) {
  return jest.fn((args: any) => {
    const where = args.where;
    const now = new Date();
    const matched = rows.filter((row) => {
      if (!where.nodeId.in.includes(row.nodeId)) return false;
      if ((row.revokedAt ?? null) !== null) return false;

      const expiresAt = row.expiresAt ?? null;
      const okExpiry = expiresAt === null || expiresAt.getTime() > now.getTime();
      if (!okExpiry) return false;

      if (Object.prototype.hasOwnProperty.call(where, 'granteeUserId')) {
        if (row.granteeUserId !== where.granteeUserId) return false;
      }
      if (Object.prototype.hasOwnProperty.call(where, 'token')) {
        if (row.token !== where.token) return false;
      }
      return true;
    });
    return Promise.resolve(matched);
  });
}

function serviceWith(node: any, shares: ShareRow[]) {
  const prisma: any = {
    node: { findUnique: jest.fn().mockResolvedValue(node) },
    share: { findMany: findManyFake(shares) },
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

  // The IDOR shape: the share is on the right node, just not for this caller.
  // Scope-based tests (sibling/descendant) cannot catch a missing principal
  // filter, because the nodeId scope is correct in this case — only identity
  // separates the two users.
  it('does not grant access via a share on this node granted to a different user', async () => {
    const { svc } = serviceWith(NODE, [{ nodeId: 'leaf', role: 'VIEWER', granteeUserId: 'u2' }]);
    await expect(svc.resolve({ kind: 'user', userId: 'u3' }, 'leaf')).rejects.toMatchObject({
      code: 'NODE_NOT_FOUND',
      status: 404,
    });
  });

  it('does not let a signed-in user claim a public link share on this node', async () => {
    const { svc } = serviceWith(NODE, [{ nodeId: 'leaf', role: 'VIEWER', token: 'tok' }]);
    await expect(svc.resolve({ kind: 'user', userId: 'u3' }, 'leaf')).rejects.toMatchObject({
      code: 'NODE_NOT_FOUND',
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

  it('does not query shares at all for an anonymous caller', async () => {
    const { svc, prisma } = serviceWith(NODE, []);
    await svc.resolve({ kind: 'anonymous' }, 'leaf').catch(() => undefined);
    expect(prisma.share.findMany).not.toHaveBeenCalled();
  });

  it('returns 404 when the node does not exist at all', async () => {
    const { svc } = serviceWith(null, []);
    await expect(svc.resolve({ kind: 'user', userId: 'owner-1' }, 'leaf')).rejects.toMatchObject({
      code: 'NODE_NOT_FOUND',
    });
  });

  it('returns 410 GONE when a soft-deleted node was accessible to the owner', async () => {
    const { svc } = serviceWith({ ...NODE, deletedAt: new Date() }, []);
    await expect(svc.resolve({ kind: 'user', userId: 'owner-1' }, 'leaf')).rejects.toMatchObject({
      code: 'NODE_GONE',
      status: 410,
    });
  });

  it('returns 410 GONE when a soft-deleted node was accessible to a viewer', async () => {
    const { svc } = serviceWith({ ...NODE, deletedAt: new Date() }, [
      { nodeId: 'leaf', role: 'VIEWER', granteeUserId: 'u2' },
    ]);
    await expect(svc.resolve({ kind: 'user', userId: 'u2' }, 'leaf')).rejects.toMatchObject({
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

  it('filters on granteeUserId for a user principal', async () => {
    const { svc, prisma } = serviceWith(NODE, []);
    await svc.resolve({ kind: 'user', userId: 'u2' }, 'leaf').catch(() => undefined);
    const where = prisma.share.findMany.mock.calls[0][0].where;
    expect(where.granteeUserId).toBe('u2');
    expect(where.token).toBeUndefined();
  });

  it('filters on token for a link principal', async () => {
    const { svc, prisma } = serviceWith(NODE, []);
    await svc.resolve({ kind: 'link', shareToken: 'tok' }, 'leaf').catch(() => undefined);
    const where = prisma.share.findMany.mock.calls[0][0].where;
    expect(where.token).toBe('tok');
    expect(where.granteeUserId).toBeUndefined();
  });

  it('resolves inheritance in a single query, not a tree walk', async () => {
    const { svc, prisma } = serviceWith(NODE, [{ nodeId: 'root', role: 'VIEWER', granteeUserId: 'u2' }]);
    await svc.resolve({ kind: 'user', userId: 'u2' }, 'leaf');
    expect(prisma.share.findMany).toHaveBeenCalledTimes(1);
  });

  it('a share on a sibling subtree does not grant access to this node', async () => {
    const { svc } = serviceWith(NODE, [{ nodeId: 'sibling', role: 'VIEWER', granteeUserId: 'u2' }]);
    await expect(svc.resolve({ kind: 'user', userId: 'u2' }, 'leaf')).rejects.toMatchObject({
      code: 'NODE_NOT_FOUND',
    });
  });

  it('a share on a descendant does not grant access to its ancestor', async () => {
    // NODE here represents 'mid'; a share exists only on its child 'leaf'.
    const midNode = { ...NODE, id: 'mid', path: '/root/mid/', parentId: 'root' };
    const { svc } = serviceWith(midNode, [{ nodeId: 'leaf', role: 'VIEWER', granteeUserId: 'u2' }]);
    await expect(svc.resolve({ kind: 'user', userId: 'u2' }, 'mid')).rejects.toMatchObject({
      code: 'NODE_NOT_FOUND',
    });
  });

  it('a link token whose share sits outside the node scope grants nothing', async () => {
    const { svc } = serviceWith(NODE, [{ nodeId: 'other-root', role: 'VIEWER', token: 'tok' }]);
    await expect(svc.resolve({ kind: 'link', shareToken: 'tok' }, 'leaf')).rejects.toMatchObject({
      code: 'NODE_NOT_FOUND',
    });
  });

  it('denies an empty-string share token rather than matching every share', async () => {
    const { svc, prisma } = serviceWith(NODE, [{ nodeId: 'leaf', role: 'VIEWER', token: 'real-token' }]);
    await expect(svc.resolve({ kind: 'link', shareToken: '' }, 'leaf')).rejects.toMatchObject({
      code: 'NODE_NOT_FOUND',
    });
    expect(prisma.share.findMany).not.toHaveBeenCalled();
  });

  it('projects the returned node to the declared AccessNode shape only', async () => {
    const { svc } = serviceWith(NODE, []);
    const access = await svc.resolve({ kind: 'user', userId: 'owner-1' }, 'leaf');
    expect(access.node).toEqual({
      id: 'leaf',
      dataRoomId: 'room',
      path: '/root/mid/leaf/',
      parentId: 'mid',
      type: 'FILE',
      name: 'leaf.txt',
      deletedAt: null,
    });
    expect((access.node as any).dataRoom).toBeUndefined();
  });
});

describe('AccessService.requireOwner', () => {
  it('lets the owner through with the actual shape', async () => {
    const { svc } = serviceWith(NODE, []);
    await expect(svc.requireOwner({ kind: 'user', userId: 'owner-1' }, 'leaf')).resolves.toEqual({
      role: 'OWNER',
      node: expect.objectContaining({ id: 'leaf' }),
    });
  });

  it('rejects a viewer with 403 FORBIDDEN', async () => {
    const { svc } = serviceWith(NODE, [{ nodeId: 'leaf', role: 'VIEWER', granteeUserId: 'u2' }]);
    await expect(svc.requireOwner({ kind: 'user', userId: 'u2' }, 'leaf')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });
  });

  it('rejects a stranger with 404 — not 403 — since 403 would confirm the id exists', async () => {
    const { svc } = serviceWith(NODE, []);
    await expect(svc.requireOwner({ kind: 'user', userId: 'nobody' }, 'leaf')).rejects.toMatchObject({
      code: 'NODE_NOT_FOUND',
      status: 404,
    });
  });
});
