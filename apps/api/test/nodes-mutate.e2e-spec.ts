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
    await app.asOwner().post('/api/folders').send({ parentId: root, name: 'legal' }).expect(409);
  });

  it('renames a node', async () => {
    const { child } = await seedTree(app, { folders: ['Legal'] });
    const res = await app.asOwner().patch(`/api/nodes/${child}`).send({ name: 'Legal & Compliance' });
    expect(res.body.name).toBe('Legal & Compliance');
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

  it('rejects moving a folder into its own descendant', async () => {
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
    await app.asOwner().patch(`/api/nodes/${nested}`).send({ parentId: nested }).expect(400);
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
    const { root, viewerToken } = await seedTree(app, { folders: ['Legal'], shareRootWith: 'u2' });
    const res = await app.asUser('u2').post('/api/folders').send({ parentId: root, name: 'X' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });
});
