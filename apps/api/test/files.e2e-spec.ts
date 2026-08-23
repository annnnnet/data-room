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

  /** Simulates the browser's PUT, then completes the upload as the owner. */
  const uploadAndComplete = async (nodeId: string, versionId: string, expectStatus = 201) => {
    await app.uploadBytes(versionId);
    return app
      .asOwner()
      .post(`/api/files/${nodeId}/complete`)
      .send({ versionId })
      .expect(expectStatus);
  };

  it('creates a real PENDING version and keeps the node out of listings', async () => {
    const { root } = await seedTree(app, {});
    const res = await upload(root, 'msa.pdf').expect(201);
    expect(res.body.finalName).toBe('msa.pdf');

    const version = await app.prisma.fileVersion.findUnique({ where: { id: res.body.versionId } });
    expect(version).not.toBeNull();
    expect(version!.nodeId).toBe(res.body.nodeId);
    expect(version!.status).toBe('PENDING');

    const list = await app.asOwner().get(`/api/nodes/${root}/children`).expect(200);
    expect(list.body.items.map((n: any) => n.id)).not.toContain(res.body.nodeId);
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
    await uploadAndComplete(body.nodeId, body.versionId);
    const list = await app.asOwner().get(`/api/nodes/${root}/children`).expect(200);
    expect(list.body.items.map((n: any) => n.name)).toEqual(['msa.pdf']);
  });

  it('refuses to complete an upload whose bytes were never PUT to storage', async () => {
    const { root } = await seedTree(app, {});
    const { body } = await upload(root, 'msa.pdf').expect(201);

    // No app.uploadBytes() call — the object was never actually written.
    const res = await app
      .asOwner()
      .post(`/api/files/${body.nodeId}/complete`)
      .send({ versionId: body.versionId });

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('UPLOAD_EXPIRED');

    // Must stay PENDING and out of the listing.
    const version = await app.prisma.fileVersion.findUnique({ where: { id: body.versionId } });
    expect(version!.status).toBe('PENDING');
    const list = await app.asOwner().get(`/api/nodes/${root}/children`).expect(200);
    expect(list.body.items).toHaveLength(0);
  });

  it('fails a same-name upload by default and suggests a name', async () => {
    const { root } = await seedTree(app, { files: ['msa.pdf'] });
    const res = await upload(root, 'msa.pdf').expect(409);
    expect(res.body.details.suggestedName).toBe('msa (2).pdf');
    expect(res.body.code).toBe('NAME_CONFLICT');
  });

  it('KEEP_BOTH creates a genuinely separate node, not a rename of the existing one', async () => {
    const { root, fileId } = await seedTree(app, { files: ['msa.pdf'] });
    const res = await upload(root, 'msa.pdf', 'KEEP_BOTH').expect(201);
    expect(res.body.finalName).toBe('msa (2).pdf');
    // A buggy implementation could return the suggested name while reusing
    // the original node id — assert both the id actually changed and that
    // the listing really does contain two entries afterward.
    expect(res.body.nodeId).not.toBe(fileId);
    await uploadAndComplete(res.body.nodeId, res.body.versionId);

    const list = await app.asOwner().get(`/api/nodes/${root}/children`).expect(200);
    expect(list.body.items.map((n: any) => n.name).sort()).toEqual(['msa (2).pdf', 'msa.pdf']);
  });

  it('REPLACE adds version 2 to the existing node instead of a new node', async () => {
    const { root, fileId } = await seedTree(app, { files: ['msa.pdf'] });
    const res = await upload(root, 'msa.pdf', 'REPLACE').expect(201);
    expect(res.body.nodeId).toBe(fileId);
    await uploadAndComplete(fileId!, res.body.versionId);
    const versions = await app.asOwner().get(`/api/files/${fileId}/versions`).expect(200);
    expect(versions.body.map((v: any) => v.versionNumber)).toEqual([2, 1]);
    expect(versions.body[0].isCurrent).toBe(true);
    expect(versions.body[1].isCurrent).toBe(false);
  });

  it('REPLACE reports the node\'s existing name, not the caller\'s casing', async () => {
    const { root, fileId } = await seedTree(app, { files: ['msa.pdf'] });
    const res = await upload(root, 'MSA.PDF', 'REPLACE').expect(201);
    expect(res.body.nodeId).toBe(fileId);
    // The node is still named "msa.pdf" — reporting "MSA.PDF" would claim a
    // rename that never happened.
    expect(res.body.finalName).toBe('msa.pdf');
  });

  it('restores an old version as a new current version, sourced from the requested one', async () => {
    const { root, fileId } = await seedTree(app, { files: ['msa.pdf'], versions: 2 });
    await app.asOwner().post(`/api/files/${fileId}/versions/1/restore`).expect(201);
    const versions = await app.asOwner().get(`/api/files/${fileId}/versions`).expect(200);
    expect(versions.body.map((v: any) => v.versionNumber)).toEqual([3, 2, 1]);
    expect(versions.body[0].versionNumber).toBe(3);
    expect(versions.body[0].isCurrent).toBe(true);
    // Version 1 was seeded with sizeBytes 1024 and version 2 with 2048 (see
    // helpers.ts) specifically so this can catch an implementation that
    // restores the wrong (e.g. latest) version instead of the requested
    // one: the new version 3 must carry version 1's size, not version 2's.
    const v1 = versions.body.find((v: any) => v.versionNumber === 1);
    const v3 = versions.body.find((v: any) => v.versionNumber === 3);
    expect(v3.sizeBytes).toBe(v1.sizeBytes);
    expect(v3.sizeBytes).toBe(1024);
  });

  it('refuses to restore a PENDING version (never uploaded)', async () => {
    const { root, fileId } = await seedTree(app, { files: ['msa.pdf'] });
    // version 2 is requested but never uploaded/completed — it stays PENDING.
    const pending = await upload(root, 'msa.pdf', 'REPLACE').expect(201);
    expect(pending.body.nodeId).toBe(fileId);

    const res = await app.asOwner().post(`/api/files/${fileId}/versions/2/restore`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NODE_NOT_FOUND');

    // Nothing should have changed: still one READY version, current unchanged.
    const versions = await app.asOwner().get(`/api/files/${fileId}/versions`).expect(200);
    expect(versions.body.map((v: any) => v.versionNumber)).toEqual([1]);
  });

  it('gives 404 for restoring a version number that never existed', async () => {
    const { fileId } = await seedTree(app, { files: ['msa.pdf'] });
    const res = await app.asOwner().post(`/api/files/${fileId}/versions/99/restore`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NODE_NOT_FOUND');
  });

  it('rejects a non-positive version number before it ever reaches the database', async () => {
    const { fileId } = await seedTree(app, { files: ['msa.pdf'] });
    const zero = await app.asOwner().post(`/api/files/${fileId}/versions/0/restore`);
    expect(zero.status).toBe(400);
    expect(zero.body.code).toBe('VALIDATION_FAILED');

    const negative = await app.asOwner().post(`/api/files/${fileId}/versions/-1/restore`);
    expect(negative.status).toBe(400);
    expect(negative.body.code).toBe('VALIDATION_FAILED');
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
    const { root, fileId, viewerId } = await seedTree(app, { files: ['msa.pdf'], shareRootWith: 'u2' });
    await app.asUser(viewerId!).get(`/api/files/${fileId}/download-url`).expect(200);
    const res = await app
      .asUser(viewerId!)
      .post('/api/files/upload-url')
      .send({ parentId: root, name: 'x.pdf', sizeBytes: 1, mimeType: 'application/pdf' })
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('refuses a viewer completing an upload', async () => {
    const seed = await seedTree(app, { files: ['msa.pdf'], shareRootWith: 'u2' });
    const { body } = await upload(seed.root, 'other.pdf').expect(201);
    const res = await app
      .asUser(seed.viewerId!)
      .post(`/api/files/${body.nodeId}/complete`)
      .send({ versionId: body.versionId });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('refuses a viewer restoring a version', async () => {
    const { fileId, viewerId } = await seedTree(app, { files: ['msa.pdf'], versions: 2, shareRootWith: 'u2' });
    const res = await app.asUser(viewerId!).post(`/api/files/${fileId}/versions/1/restore`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  // Design decision: version history is owner edit metadata (who uploaded
  // each version, when) — not the file content itself, which a VIEWER still
  // gets via download-url. The sharing requirement is read-only access to
  // the shared *item*, not its edit history, so this is owner-only
  // regardless of how VIEWER was granted (named-user share or link).
  it('refuses a named-user viewer listing version history, but lets the owner', async () => {
    const { fileId, viewerId } = await seedTree(app, { files: ['msa.pdf'], versions: 2, shareRootWith: 'u2' });
    const res = await app.asUser(viewerId!).get(`/api/files/${fileId}/versions`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');

    const ownerRes = await app.asOwner().get(`/api/files/${fileId}/versions`).expect(200);
    expect(ownerRes.body.map((v: any) => v.versionNumber)).toEqual([2, 1]);
  });

  it('refuses a link (public share) principal listing version history', async () => {
    const { root, fileId } = await seedTree(app, { files: ['msa.pdf'], versions: 2 });
    const share = await app.asOwner().post(`/api/nodes/${root}/shares`).send({ kind: 'LINK' }).expect(201);
    const res = await app.asLink(share.body.token).get(`/api/files/${fileId}/versions`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('combines a PENDING file with a cursor without ever surfacing it, across pages', async () => {
    const { root } = await seedTree(app, {});
    // 5 READY files (via seedTree's own helper), interleaved with 5 PENDING
    // ones created through the real upload flow so the (parentId,type,name)
    // index actually has PENDING rows sitting inside the paginated range.
    const readyNames = Array.from({ length: 5 }, (_, i) => `ready-${String(i).padStart(2, '0')}.pdf`);
    for (const name of readyNames) {
      const { body } = await upload(root, name).expect(201);
      await uploadAndComplete(body.nodeId, body.versionId);
    }
    const pendingNames = Array.from({ length: 5 }, (_, i) => `pending-${String(i).padStart(2, '0')}.pdf`);
    for (const name of pendingNames) {
      await upload(root, name).expect(201);
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const url = `/api/nodes/${root}/children?limit=2${cursor ? `&cursor=${cursor}` : ''}`;
      const res: any = await app.asOwner().get(url).expect(200);
      seen.push(...res.body.items.map((n: any) => n.name));
      cursor = res.body.nextCursor;
    } while (cursor);

    expect(seen).toHaveLength(5);
    expect(seen.sort()).toEqual([...readyNames].sort());
    for (const name of pendingNames) {
      expect(seen).not.toContain(name);
    }
  });
});
