import { createTestApp, TestApp, seedTree } from './helpers';
import { UserService } from '../src/auth/user.service';

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

  it('does not grant link access to a sibling outside the shared subtree', async () => {
    const { nested, second } = await seedTree(app, {
      nested: ['Legal', 'Contracts'],
      folders: ['Archive'],
    });
    const share = await app.asOwner().post(`/api/nodes/${nested}/shares`).send({ kind: 'LINK' });
    const res = await app.asLink(share.body.token).get(`/api/nodes/${second}`).expect(404);
    expect(res.body.code).toBe('NODE_NOT_FOUND');
  });

  it('does not grant link access upward to the parent', async () => {
    const { root, nested } = await seedTree(app, { nested: ['Legal', 'Contracts'] });
    const share = await app.asOwner().post(`/api/nodes/${nested}/shares`).send({ kind: 'LINK' });
    const res = await app.asLink(share.body.token).get(`/api/nodes/${root}`).expect(404);
    expect(res.body.code).toBe('NODE_NOT_FOUND');
  });

  it('grants a named user read access and keeps writes forbidden', async () => {
    const { root } = await seedTree(app, {});
    // 'u2' must already have a User row whose email matches the invite —
    // TestAuthGuard sets principal.userId to the literal string passed to
    // asUser(), it never runs the real claims/email flow, so the match has
    // to be pre-established here (an already-signed-up invitee), not via
    // the reconciliation path exercised separately below.
    await app.prisma.user.upsert({
      where: { id: 'u2' },
      update: {},
      create: { id: 'u2', supabaseSub: 'test-u2-fixed', email: 'u2@acme.test' },
    });
    app._userIds.push('u2');
    await app
      .asOwner()
      .post(`/api/nodes/${root}/shares`)
      .send({ kind: 'USER', email: 'u2@acme.test' })
      .expect(201);
    await app.asUser('u2').get(`/api/nodes/${root}`).expect(200);
    const res = await app
      .asUser('u2')
      .post('/api/folders')
      .send({ parentId: root, name: 'X' })
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('revokes access immediately', async () => {
    const { root } = await seedTree(app, {});
    const share = await app.asOwner().post(`/api/nodes/${root}/shares`).send({ kind: 'LINK' });
    await app.asLink(share.body.token).get(`/api/nodes/${root}`).expect(200);
    await app.asOwner().delete(`/api/shares/${share.body.id}`).expect(200);
    const res = await app.asLink(share.body.token).get(`/api/nodes/${root}`).expect(404);
    expect(res.body.code).toBe('NODE_NOT_FOUND');
  });

  it('rejects an expired share', async () => {
    const { root } = await seedTree(app, {});
    const past = new Date(Date.now() - 60_000).toISOString();
    const share = await app
      .asOwner()
      .post(`/api/nodes/${root}/shares`)
      .send({ kind: 'LINK', expiresAt: past })
      .expect(201);
    const res = await app.asLink(share.body.token).get(`/api/nodes/${root}`).expect(404);
    expect(res.body.code).toBe('NODE_NOT_FOUND');
  });

  it('returns 410 GONE to a link whose shared folder was deleted', async () => {
    const { nested } = await seedTree(app, { nested: ['Legal', 'Contracts'] });
    const share = await app.asOwner().post(`/api/nodes/${nested}/shares`).send({ kind: 'LINK' });
    await app.asOwner().delete(`/api/nodes/${nested}`).expect(200);
    const res = await app.asLink(share.body.token).get(`/api/nodes/${nested}`).expect(410);
    expect(res.body.code).toBe('NODE_GONE');
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

  it('invites an email that has not signed up yet, then grants access once that person authenticates', async () => {
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
    // then confirm the share now resolves for their user id.
    const userService = app.nest.get(UserService);
    const user = await userService.upsertFromClaims({
      sub: 'newcomer-sub',
      email: 'newcomer@acme.test',
    });
    app._userIds.push(user.id);

    await app.asUser(user.id).get(`/api/nodes/${root}`).expect(200);
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
});
