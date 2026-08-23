import { createTestApp, TestApp, seedTree } from './helpers';

describe('node mutations', () => {
  let app: TestApp;
  beforeAll(async () => { app = await createTestApp(); });
  afterAll(() => app.close());

  it('rejects a duplicate folder name with NAME_CONFLICT and a suggestion', async () => {
    const { root } = await seedTree(app, { folders: ['Legal'] });
    const res = await app.asOwner()
      .post('/api/folders').send({ parentId: root, name: 'Legal' }).expect(409);
    expect(res.body.code).toBe('NAME_CONFLICT');
    expect(res.body.details.suggestedName).toBe('Legal (2)');
  });

  it('treats names case-insensitively, matching the unique index', async () => {
    const { root } = await seedTree(app, { folders: ['Legal'] });
    const res = await app.asOwner().post('/api/folders').send({ parentId: root, name: 'legal' }).expect(409);
    expect(res.body.code).toBe('NAME_CONFLICT');
  });

  it('rejects creating a folder under a file parent', async () => {
    const { fileId } = await seedTree(app, { files: ['report.pdf'] });
    const res = await app.asOwner()
      .post('/api/folders').send({ parentId: fileId, name: 'Sub' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_MOVE');
  });

  it('renames a node', async () => {
    const { child } = await seedTree(app, { folders: ['Legal'] });
    const res = await app.asOwner().patch(`/api/nodes/${child}`).send({ name: 'Legal & Compliance' }).expect(200);
    expect(res.body.name).toBe('Legal & Compliance');
    expect(res.body.code).toBeUndefined();
  });

  it('rewrites descendant paths when a folder moves', async () => {
    const { root, nested, nestedChild, second } = await seedTree(app, {
      nested: ['Legal', 'Contracts'],
      nestedFiles: [{ name: 'msa.pdf', size: 10 }],
      folders: ['Archive'],
    });
    await app.asOwner().patch(`/api/nodes/${nested}`).send({ parentId: second }).expect(200);
    const res = await app.asOwner().get(`/api/nodes/${nestedChild}`).expect(200);
    expect(res.body.breadcrumbs.map((b: any) => b.id)).toEqual([root, second, nested, nestedChild]);
  });

  it('keeps a descendant depth consistent with its path after an ancestor moves', async () => {
    // `second` (a top-level folder, depth 1) has no children — moving
    // `nested` (Contracts, depth 2, parent = `child`/Legal at depth 1)
    // straight under `root` (depth 0) changes its depth by -1, so a
    // descendant that keeps a stale value (the bug) is distinguishable
    // from one correctly shifted by the same delta.
    const { root, nested, nestedChild } = await seedTree(app, {
      nested: ['Legal', 'Contracts'],
      nestedFiles: [{ name: 'msa.pdf', size: 10 }],
    });
    const before = await app.prisma.node.findUniqueOrThrow({ where: { id: nestedChild! } });
    expect(before.depth).toBe(3);

    await app.asOwner().patch(`/api/nodes/${nested}`).send({ parentId: root }).expect(200);

    const after = await app.prisma.node.findUniqueOrThrow({ where: { id: nestedChild! } });
    expect(after.depth).toBe(2);
    // Depth must stay in lockstep with the rewritten path, not merely
    // "some smaller number" — recompute independently from `path`.
    expect(after.depth).toBe(after.path.split('/').filter(Boolean).length - 1);
  });

  it('rejects moving a folder into its own descendant', async () => {
    // Both nodes here are FOLDERS (`child` and `nested`, from the `nested`
    // chain) — using a FILE for the destination would let the earlier
    // `dest.type !== 'FOLDER'` check reject the move for an unrelated
    // reason, masking whether the cycle guard itself ever ran.
    const { child, nested } = await seedTree(app, {
      nested: ['Legal', 'Contracts'],
    });
    const res = await app.asOwner().patch(`/api/nodes/${child}`).send({ parentId: nested });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_MOVE');
  });

  it('rejects moving a node into a non-folder destination', async () => {
    const { nested, nestedChild } = await seedTree(app, {
      nested: ['Legal', 'Contracts'],
      nestedFiles: [{ name: 'msa.pdf', size: 10 }],
    });
    const res = await app.asOwner().patch(`/api/nodes/${nested}`).send({ parentId: nestedChild });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_MOVE');
  });

  it('rejects moving a node into itself', async () => {
    const { nested } = await seedTree(app, { nested: ['Legal', 'Contracts'] });
    const res = await app.asOwner().patch(`/api/nodes/${nested}`).send({ parentId: nested });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_MOVE');
  });

  it('rejects a nonexistent move destination with 404, not an existence oracle', async () => {
    const { child } = await seedTree(app, { folders: ['Legal'] });
    const res = await app.asOwner().patch(`/api/nodes/${child}`).send({ parentId: 'not-a-real-id' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NODE_NOT_FOUND');
  });

  it('rejects moving into a colliding name with 409 and a suggestion, even without an explicit rename', async () => {
    // `child` = Archive (from `nested`), `nested` = Legal (nested inside
    // Archive), `second` = the top-level Legal folder. Moving `second` into
    // `child` (a pure { parentId } move, no `name` in the body) must still
    // catch that Archive already has a child named "Legal".
    const { child, second } = await seedTree(app, {
      folders: ['Legal'],
      nested: ['Archive', 'Legal'],
    });
    const res = await app.asOwner().patch(`/api/nodes/${second}`).send({ parentId: child });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NAME_CONFLICT');
    expect(res.body.details.suggestedName).toBe('Legal (2)');
  });

  it('soft-deletes the whole subtree in one call', async () => {
    // Deleting `child` (the top of the nested chain, and root's only child
    // in this fixture) must remove it AND everything under it — `child`
    // itself, `nested`, and the file nested under that — in one call, and
    // leave root with no children at all.
    const { root, child } = await seedTree(app, {
      nested: ['Legal', 'Contracts'],
      nestedFiles: [{ name: 'msa.pdf', size: 10 }],
    });
    const res = await app.asOwner().delete(`/api/nodes/${child}`).expect(200);
    expect(res.body.deletedCount).toBe(3);
    const list = await app.asOwner().get(`/api/nodes/${root}/children`).expect(200);
    expect(list.body.items).toHaveLength(0);
  });

  it('stamps a grandchild two levels below the deleted node, not just direct children', async () => {
    const { child, nestedChild } = await seedTree(app, {
      nested: ['Legal', 'Contracts'],
      nestedFiles: [{ name: 'msa.pdf', size: 10 }],
    });
    await app.asOwner().delete(`/api/nodes/${child}`).expect(200);

    // Read the grandchild itself, directly — not the parent's children
    // list and not a count — to prove its own deletedAt was stamped.
    const res = await app.asOwner().get(`/api/nodes/${nestedChild}`);
    expect(res.status).toBe(410);
    expect(res.body.code).toBe('NODE_GONE');
  });

  it('revokes a viewer sharing a deep node once an ancestor is deleted', async () => {
    // The share is granted directly on `nested` (a deep node), and `child`
    // is an ancestor of `nested`. Deleting `child` as the owner must stamp
    // `nested`'s own deletedAt too (the whole subtree, not just `child`),
    // so a viewer whose grant is on `nested` itself must lose access —
    // AccessService.resolve finds their share (still live), but then still
    // must see `nested.deletedAt` and refuse. The attack this guards
    // against: a share surviving on a node whose ancestor was deleted.
    const { child, nested, nestedViewerId } = await seedTree(app, {
      nested: ['Legal', 'Contracts'],
      shareNestedWith: 'viewer-1',
    });
    await app.asOwner().delete(`/api/nodes/${child}`).expect(200);

    const res = await app.asUser(nestedViewerId!).get(`/api/nodes/${nested}`);
    expect(res.status).not.toBe(200);
    expect(res.body.code).toBe('NODE_GONE');
  });

  it('returns 410 GONE when reading a deleted node', async () => {
    const { nested } = await seedTree(app, { nested: ['Legal', 'Contracts'] });
    await app.asOwner().delete(`/api/nodes/${nested}`).expect(200);
    const res = await app.asOwner().get(`/api/nodes/${nested}`);
    expect(res.status).toBe(410);
    expect(res.body.code).toBe('NODE_GONE');
  });

  it('frees the name for reuse after deletion', async () => {
    const { root, child } = await seedTree(app, { folders: ['Legal'] });
    await app.asOwner().delete(`/api/nodes/${child}`).expect(200);
    await app.asOwner().post('/api/folders').send({ parentId: root, name: 'Legal' }).expect(201);
  });

  it('forbids a viewer from mutating', async () => {
    const { root, viewerId } = await seedTree(app, { folders: ['Legal'], shareRootWith: 'u2' });
    const res = await app.asUser(viewerId!).post('/api/folders').send({ parentId: root, name: 'X' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });
});
