import { createTestApp, TestApp, seedTree } from './helpers';

describe('files', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  }); // storage stubbed in helpers
  afterAll(() => app.close());

  const upload = (root: string, name: string, onConflict = 'FAIL') =>
    app
      .asOwner()
      .post('/api/files/upload-url')
      .send({ parentId: root, name, sizeBytes: 100, mimeType: 'application/pdf', onConflict });

  it('creates a pending version and returns a signed URL', async () => {
    const { root } = await seedTree(app, {});
    const res = await upload(root, 'msa.pdf').expect(201);
    expect(res.body.uploadUrl).toContain('signed');
    expect(res.body.finalName).toBe('msa.pdf');
  });

  it('hides a pending file from listings until completion', async () => {
    const { root } = await seedTree(app, {});
    await upload(root, 'msa.pdf').expect(201);
    const list = await app.asOwner().get(`/api/nodes/${root}/children`).expect(200);
    expect(list.body.items).toHaveLength(0);
  });

  it('shows the file once completed', async () => {
    const { root } = await seedTree(app, {});
    const { body } = await upload(root, 'msa.pdf').expect(201);
    await app
      .asOwner()
      .post(`/api/files/${body.nodeId}/complete`)
      .send({ versionId: body.versionId })
      .expect(201);
    const list = await app.asOwner().get(`/api/nodes/${root}/children`).expect(200);
    expect(list.body.items.map((n: any) => n.name)).toEqual(['msa.pdf']);
  });

  it('fails a same-name upload by default and suggests a name', async () => {
    const { root } = await seedTree(app, { files: ['msa.pdf'] });
    const res = await upload(root, 'msa.pdf').expect(409);
    expect(res.body.details.suggestedName).toBe('msa (2).pdf');
    expect(res.body.code).toBe('NAME_CONFLICT');
  });

  it('KEEP_BOTH creates a second node with the suggested name', async () => {
    const { root } = await seedTree(app, { files: ['msa.pdf'] });
    const res = await upload(root, 'msa.pdf', 'KEEP_BOTH').expect(201);
    expect(res.body.finalName).toBe('msa (2).pdf');
  });

  it('REPLACE adds version 2 to the existing node instead of a new node', async () => {
    const { root, fileId } = await seedTree(app, { files: ['msa.pdf'] });
    const res = await upload(root, 'msa.pdf', 'REPLACE').expect(201);
    expect(res.body.nodeId).toBe(fileId);
    await app
      .asOwner()
      .post(`/api/files/${fileId}/complete`)
      .send({ versionId: res.body.versionId })
      .expect(201);
    const versions = await app.asOwner().get(`/api/files/${fileId}/versions`).expect(200);
    expect(versions.body.map((v: any) => v.versionNumber)).toEqual([2, 1]);
    expect(versions.body[0].isCurrent).toBe(true);
    expect(versions.body[1].isCurrent).toBe(false);
  });

  it('restores an old version as a new current version', async () => {
    const { root, fileId } = await seedTree(app, { files: ['msa.pdf'], versions: 2 });
    await app.asOwner().post(`/api/files/${fileId}/versions/1/restore`).expect(201);
    const versions = await app.asOwner().get(`/api/files/${fileId}/versions`).expect(200);
    expect(versions.body.map((v: any) => v.versionNumber)).toEqual([3, 2, 1]);
    expect(versions.body[0].versionNumber).toBe(3);
    expect(versions.body[0].isCurrent).toBe(true);
  });

  // Owning the node does not imply owning the version. Without a scope check,
  // an owner could point their own node at another tenant's blob and publish
  // that tenant's half-finished upload as a side effect.
  it('refuses to complete a node with a version belonging to a different node', async () => {
    const mine = await seedTree(app, {});
    const theirs = await seedTree(app, {});

    const victim = await app
      .asUser(theirs.ownerId)
      .post('/api/files/upload-url')
      .send({ parentId: theirs.root, name: 'secret.pdf', sizeBytes: 100, mimeType: 'application/pdf' })
      .expect(201);

    const attacker = await app
      .asUser(mine.ownerId)
      .post('/api/files/upload-url')
      .send({ parentId: mine.root, name: 'mine.pdf', sizeBytes: 100, mimeType: 'application/pdf' })
      .expect(201);

    const res = await app
      .asUser(mine.ownerId)
      .post(`/api/files/${attacker.body.nodeId}/complete`)
      .send({ versionId: victim.body.versionId });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NODE_NOT_FOUND');

    // The victim's version must still be PENDING, so it stays invisible.
    const theirListing = await app.asUser(theirs.ownerId).get(`/api/nodes/${theirs.root}/children`).expect(200);
    expect(theirListing.body.items).toHaveLength(0);
  });

  it('gives a viewer a download URL but not an upload URL', async () => {
    const { root, fileId } = await seedTree(app, { files: ['msa.pdf'], shareRootWith: 'u2' });
    await app.asUser('u2').get(`/api/files/${fileId}/download-url`).expect(200);
    const res = await app
      .asUser('u2')
      .post('/api/files/upload-url')
      .send({ parentId: root, name: 'x.pdf', sizeBytes: 1, mimeType: 'application/pdf' })
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });
});
