import { randomUUID } from 'node:crypto';
import { createTestApp, TestApp, seedTree } from './helpers';
import { UserService } from '../src/auth/user.service';
import { buildPath } from '../src/common/path.util';

describe('sharing', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('grants link access to the shared node and its descendants', async () => {
    const { nested, nestedChild } = await seedTree(app, {
      nested: ['Legal', 'Contracts'],
      nestedFiles: ['msa.pdf'],
    });
    const share = await app
      .asOwner()
      .post(`/api/nodes/${nested}/shares`)
      .send({ kind: 'LINK' })
      .expect(201);
    await app.asLink(share.body.token).get(`/api/nodes/${nestedChild}`).expect(200);
  });

  it('does not grant link access to a sibling of the shared node itself', async () => {
    const { child, nested } = await seedTree(app, { nested: ['Legal', 'Contracts'] });
    // A sibling created directly under the shared node's own parent (`child`,
    // the "Legal" folder) — the tightest possible boundary. A test using a
    // sibling of `child` instead (a grandparent-level sibling) would still
    // pass even if the path-prefix comparison were subtly wrong one level up.
    const parent = await app.prisma.node.findUniqueOrThrow({ where: { id: child! } });
    const siblingId = randomUUID();
    await app.prisma.node.create({
      data: {
        id: siblingId,
        dataRoomId: parent.dataRoomId,
        parentId: parent.id,
        type: 'FOLDER',
        name: 'Contracts Archive',
        path: buildPath(parent.path, siblingId),
        depth: parent.depth + 1,
        createdById: app.ownerId,
      },
    });
    const share = await app.asOwner().post(`/api/nodes/${nested}/shares`).send({ kind: 'LINK' });
    const res = await app.asLink(share.body.token).get(`/api/nodes/${siblingId}`).expect(404);
    expect(res.body.code).toBe('NODE_NOT_FOUND');
  });

  it('does not grant link access upward to the immediate parent', async () => {
    const { child, nested } = await seedTree(app, { nested: ['Legal', 'Contracts'] });
    // `child` ("Legal") is the shared node's direct parent, not a distant
    // grandparent — the tightest possible boundary for "no upward access".
    const share = await app.asOwner().post(`/api/nodes/${nested}/shares`).send({ kind: 'LINK' });
    const res = await app.asLink(share.body.token).get(`/api/nodes/${child}`).expect(404);
    expect(res.body.code).toBe('NODE_NOT_FOUND');
  });

  it('grants a named user read access and keeps writes forbidden', async () => {
    const { root } = await seedTree(app, {});
    // A fresh, random id/email per run: two parallel jest workers running
    // this file must never contend over the same fixture row.
    const granteeId = randomUUID();
    const granteeEmail = `${granteeId}@acme.test`;
    await app.prisma.user.upsert({
      where: { id: granteeId },
      update: {},
      create: { id: granteeId, supabaseSub: `test-${granteeId}`, email: granteeEmail },
    });
    app._userIds.push(granteeId);
    await app
      .asOwner()
      .post(`/api/nodes/${root}/shares`)
      .send({ kind: 'USER', email: granteeEmail })
      .expect(201);
    await app.asUser(granteeId).get(`/api/nodes/${root}`).expect(200);
    const res = await app
      .asUser(granteeId)
      .post('/api/folders')
      .send({ parentId: root, name: 'X' })
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('matches an invite to a differently-cased address against the registered user', async () => {
    const { root } = await seedTree(app, {});
    const granteeId = randomUUID();
    const granteeEmail = `${granteeId}@acme.test`;
    await app.prisma.user.upsert({
      where: { id: granteeId },
      update: {},
      create: { id: granteeId, supabaseSub: `test-${granteeId}`, email: granteeEmail },
    });
    app._userIds.push(granteeId);

    // Invite sent to an upper-cased version of the registered address.
    const invited = granteeEmail.toUpperCase();
    expect(invited).not.toBe(granteeEmail);
    await app
      .asOwner()
      .post(`/api/nodes/${root}/shares`)
      .send({ kind: 'USER', email: invited })
      .expect(201);

    await app.asUser(granteeId).get(`/api/nodes/${root}`).expect(200);
  });

  it('revokes access immediately', async () => {
    const { root } = await seedTree(app, {});
    const share = await app.asOwner().post(`/api/nodes/${root}/shares`).send({ kind: 'LINK' });
    await app.asLink(share.body.token).get(`/api/nodes/${root}`).expect(200);
    await app.asOwner().delete(`/api/shares/${share.body.id}`).expect(200);
    const res = await app.asLink(share.body.token).get(`/api/nodes/${root}`).expect(404);
    expect(res.body.code).toBe('NODE_NOT_FOUND');
  });

  it('preserves the original revokedAt when revoked more than once', async () => {
    const { root } = await seedTree(app, {});
    const share = await app.asOwner().post(`/api/nodes/${root}/shares`).send({ kind: 'LINK' });
    await app.asOwner().delete(`/api/shares/${share.body.id}`).expect(200);
    const firstRow = await app.prisma.share.findUniqueOrThrow({ where: { id: share.body.id } });
    expect(firstRow.revokedAt).not.toBeNull();

    // A little delay so a buggy implementation that overwrites revokedAt
    // would produce a measurably later timestamp, not one indistinguishable
    // by clock resolution alone.
    await new Promise((r) => setTimeout(r, 5));

    await app.asOwner().delete(`/api/shares/${share.body.id}`).expect(200);
    const secondRow = await app.prisma.share.findUniqueOrThrow({ where: { id: share.body.id } });
    expect(secondRow.revokedAt?.getTime()).toBe(firstRow.revokedAt?.getTime());
  });

  it('rejects an expiresAt in the past instead of creating a dead-on-arrival share', async () => {
    const { root } = await seedTree(app, {});
    const past = new Date(Date.now() - 60_000).toISOString();
    const res = await app
      .asOwner()
      .post(`/api/nodes/${root}/shares`)
      .send({ kind: 'LINK', expiresAt: past });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a LINK share that also names a grantee email', async () => {
    const { root } = await seedTree(app, {});
    const res = await app
      .asOwner()
      .post(`/api/nodes/${root}/shares`)
      .send({ kind: 'LINK', email: 'someone@acme.test' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('returns 410 GONE to a link whose shared folder was deleted', async () => {
    const { nested } = await seedTree(app, { nested: ['Legal', 'Contracts'] });
    const share = await app.asOwner().post(`/api/nodes/${nested}/shares`).send({ kind: 'LINK' });
    await app.asOwner().delete(`/api/nodes/${nested}`).expect(200);
    const res = await app.asLink(share.body.token).get(`/api/nodes/${nested}`).expect(410);
    expect(res.body.code).toBe('NODE_GONE');
  });

  it('lets the owner revoke a share on a node that has since been soft-deleted', async () => {
    const { nested } = await seedTree(app, { nested: ['Legal', 'Contracts'] });
    const share = await app.asOwner().post(`/api/nodes/${nested}/shares`).send({ kind: 'LINK' });
    await app.asOwner().delete(`/api/nodes/${nested}`).expect(200);
    await app.asOwner().delete(`/api/shares/${share.body.id}`).expect(200);
    const row = await app.prisma.share.findUniqueOrThrow({ where: { id: share.body.id } });
    expect(row.revokedAt).not.toBeNull();
  });

  it('lets a non-owner viewer neither list nor create shares', async () => {
    const { root } = await seedTree(app, { shareRootWith: 'u2' });
    const res = await app.asUser('u2').get(`/api/nodes/${root}/shares`).expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
    const res2 = await app
      .asUser('u2')
      .post(`/api/nodes/${root}/shares`)
      .send({ kind: 'LINK' })
      .expect(403);
    expect(res2.body.code).toBe('FORBIDDEN');
  });

  it('404s a stranger revoking a share on a node they do not own, never confirming it exists', async () => {
    const owned = await seedTree(app, {});
    // Create the share before seeding a second room — seedTree() mutates
    // app.ownerId to the room it just created, so asOwner() must be used
    // while `owned` is still the current room.
    const share = await app.asOwner().post(`/api/nodes/${owned.root}/shares`).send({ kind: 'LINK' }).expect(201);
    const stranger = await seedTree(app, {});

    const res = await app.asUser(stranger.ownerId).delete(`/api/shares/${share.body.id}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NODE_NOT_FOUND');

    // The share must still be live — the stranger's request must not have
    // revoked it as a side effect of being denied.
    const row = await app.prisma.share.findUniqueOrThrow({ where: { id: share.body.id } });
    expect(row.revokedAt).toBeNull();
  });

  it('forbids a LINK principal from listing, creating, or revoking shares, and never echoes the token back', async () => {
    const { root } = await seedTree(app, {});
    const share = await app.asOwner().post(`/api/nodes/${root}/shares`).send({ kind: 'LINK' }).expect(201);
    const token = share.body.token as string;
    const asLink = app.asLink(token);

    const list = await asLink.get(`/api/nodes/${root}/shares`);
    expect(list.status).toBe(403);
    expect(list.body.code).toBe('FORBIDDEN');
    expect(JSON.stringify(list.body)).not.toContain(token);

    const create = await asLink.post(`/api/nodes/${root}/shares`).send({ kind: 'LINK' });
    expect(create.status).toBe(403);
    expect(create.body.code).toBe('FORBIDDEN');
    expect(JSON.stringify(create.body)).not.toContain(token);

    const revoke = await asLink.delete(`/api/shares/${share.body.id}`);
    expect(revoke.status).toBe(403);
    expect(revoke.body.code).toBe('FORBIDDEN');
    expect(JSON.stringify(revoke.body)).not.toContain(token);

    // None of the forbidden attempts should have revoked the share.
    const row = await app.prisma.share.findUniqueOrThrow({ where: { id: share.body.id } });
    expect(row.revokedAt).toBeNull();
  });

  it('invites an email that has not signed up yet, then grants access once that person authenticates with a verified email', async () => {
    const { root } = await seedTree(app, {});
    // No user row exists for this email yet — the share is created purely
    // from the invited address.
    await app
      .asOwner()
      .post(`/api/nodes/${root}/shares`)
      .send({ kind: 'USER', email: 'newcomer@acme.test' })
      .expect(201);

    // Before the invitee ever authenticates, nothing in the DB points a
    // userId at this share — simulate their first sign-in via the same
    // reconciliation path AuthGuard drives (UserService.upsertFromClaims),
    // then confirm the share now resolves for their user id. Reconciliation
    // only fires for a verified email (see UserService), so the claims here
    // must say so explicitly.
    const userService = app.nest.get(UserService);
    const user = await userService.upsertFromClaims({
      sub: 'newcomer-sub',
      email: 'newcomer@acme.test',
      email_verified: true,
    });
    app._userIds.push(user.id);

    await app.asUser(user.id).get(`/api/nodes/${root}`).expect(200);
  });

  it('does not reconcile an invite for a claims email that is not marked verified', async () => {
    const { root } = await seedTree(app, {});
    await app
      .asOwner()
      .post(`/api/nodes/${root}/shares`)
      .send({ kind: 'USER', email: 'unverified-newcomer@acme.test' })
      .expect(201);

    const userService = app.nest.get(UserService);
    const user = await userService.upsertFromClaims({
      sub: 'unverified-newcomer-sub',
      email: 'unverified-newcomer@acme.test',
      // No email_verified claim at all — must be treated as unverified.
    });
    app._userIds.push(user.id);

    const res = await app.asUser(user.id).get(`/api/nodes/${root}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NODE_NOT_FOUND');
  });

  it('exposes public context for a live link token, and 404s an unknown one', async () => {
    const { nested } = await seedTree(app, { nested: ['Legal', 'Contracts'] });
    const share = await app.asOwner().post(`/api/nodes/${nested}/shares`).send({ kind: 'LINK' });

    const ctx = await app.asAnonymous().get(`/api/shares/context?token=${share.body.token}`).expect(200);
    expect(ctx.body.rootNodeId).toBe(nested);
    expect(ctx.body.nodeName).toBe('Contracts');

    const res = await app.asAnonymous().get('/api/shares/context?token=not-a-real-token').expect(404);
    expect(res.body.code).toBe('SHARE_REVOKED');
  });

  // Prisma drops an `undefined` filter, so an unvalidated missing token turns
  // `findFirst({ where: { token } })` into "any live share in the database" —
  // an anonymous cross-tenant disclosure of node ids and room names.
  it('rejects a context request with no token instead of matching any live share', async () => {
    const { nested } = await seedTree(app, { nested: ['Legal', 'Contracts'] });
    await app.asOwner().post(`/api/nodes/${nested}/shares`).send({ kind: 'LINK' }).expect(201);

    for (const url of [
      '/api/shares/context',
      '/api/shares/context?token=',
      '/api/shares/context?token[]=a&token[]=b',
    ]) {
      const res = await app.asAnonymous().get(url);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.rootNodeId).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('Acme');
    }
  });
});
