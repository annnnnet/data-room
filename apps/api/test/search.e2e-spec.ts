import { createTestApp, TestApp, seedTree } from './helpers';

describe('search', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('matches a substring case-insensitively', async () => {
    const { roomId } = await seedTree(app, {
      files: ['Master Services Agreement.pdf', 'Employee Handbook.pdf'],
    });
    const res = await app.asOwner().get(`/api/search?dataRoomId=${roomId}&q=SERVICES`).expect(200);
    expect(res.body.items.map((n: any) => n.name)).toEqual(['Master Services Agreement.pdf']);
  });

  it('finds nested matches anywhere in the room', async () => {
    const { roomId } = await seedTree(app, {
      nested: ['Legal', 'Contracts'],
      nestedFiles: [{ name: 'nda.pdf', size: 1 }],
      files: ['unrelated.pdf'],
    });
    const res = await app.asOwner().get(`/api/search?dataRoomId=${roomId}&q=nda`).expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].breadcrumbLabel).toBe('Legal / Contracts');
  });

  it('excludes soft-deleted nodes', async () => {
    const { roomId, child } = await seedTree(app, { folders: ['Legal', 'Legalese'] });
    await app.asOwner().delete(`/api/nodes/${child}`).expect(200);
    const res = await app.asOwner().get(`/api/search?dataRoomId=${roomId}&q=legal`).expect(200);
    // 'Legal' was soft-deleted; 'Legalese' (a distinct, non-deleted sibling
    // that also matches the substring) must still come back — proving the
    // deletedAt filter excludes the specific deleted row rather than the
    // whole result set collapsing to empty for some unrelated reason.
    expect(res.body.items.map((n: any) => n.name)).toEqual(['Legalese']);
  });

  it('excludes a PENDING (never-uploaded) file', async () => {
    const { roomId, root } = await seedTree(app, { files: ['ready-contract.pdf'] });
    // Start (but never complete) an upload — leaves a FILE node with a null
    // currentVersionId, the PENDING state that must stay invisible.
    const startRes = await app
      .asOwner()
      .post('/api/files/upload-url')
      .send({
        parentId: root,
        name: 'pending-contract.pdf',
        sizeBytes: 10,
        mimeType: 'application/pdf',
        onConflict: 'FAIL',
      })
      .expect(201);
    expect(startRes.body.finalName).toBe('pending-contract.pdf');

    const res = await app.asOwner().get(`/api/search?dataRoomId=${roomId}&q=contract`).expect(200);
    expect(res.body.items.map((n: any) => n.name)).toEqual(['ready-contract.pdf']);
  });

  it('scopes a viewer to their shared subtree only, finding matches inside it', async () => {
    const { roomId, nestedViewerId } = await seedTree(app, {
      nested: ['Legal', 'Contracts'],
      nestedFiles: [{ name: 'nda-agreement.pdf', size: 1 }],
      folders: ['Archive'],
      shareNestedWith: 'searchviewer2',
    });
    const res = await app
      .asUser(nestedViewerId!)
      .get(`/api/search?dataRoomId=${roomId}&q=agreement`)
      .expect(200);
    expect(res.body.items.map((n: any) => n.name)).toEqual(['nda-agreement.pdf']);
  });

  it('scopes a viewer away from matches outside their shared subtree', async () => {
    const { roomId, nestedViewerId } = await seedTree(app, {
      nested: ['Legal', 'Contracts'],
      folders: ['Archive Room'],
      shareNestedWith: 'searchviewer',
    });
    void nestedViewerId;
    // 'Archive Room' lives outside the shared 'Legal/Contracts' subtree and
    // matches the query substring — a scoping bug that filtered results in
    // JS after an unscoped fetch, or that scoped only by name, would still
    // return it.
    const res = await app
      .asUser(nestedViewerId!)
      .get(`/api/search?dataRoomId=${roomId}&q=archive`)
      .expect(200);
    expect(res.body.items).toHaveLength(0);
  });

  it('returns an empty page for a room the caller cannot see', async () => {
    const { roomId } = await seedTree(app, { files: ['msa.pdf'] });
    const res = await app.asStranger().get(`/api/search?dataRoomId=${roomId}&q=msa`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NODE_NOT_FOUND');
  });

  it('rejects a missing q', async () => {
    const { roomId } = await seedTree(app, { files: ['msa.pdf'] });
    const res = await app.asOwner().get(`/api/search?dataRoomId=${roomId}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('rejects an empty q rather than degrading into an unscoped match', async () => {
    const { roomId } = await seedTree(app, { files: ['msa.pdf'] });
    const res = await app.asOwner().get(`/api/search?dataRoomId=${roomId}&q=`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a missing dataRoomId', async () => {
    await seedTree(app, { files: ['msa.pdf'] });
    const res = await app.asOwner().get('/api/search?q=msa');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('never shows the room root as a search hit', async () => {
    const { roomId } = await seedTree(app, {
      roomName: 'FindMeRoot',
      files: ['unrelated.pdf'],
    });
    const res = await app.asOwner().get(`/api/search?dataRoomId=${roomId}&q=FindMeRoot`).expect(200);
    expect(res.body.items).toHaveLength(0);
  });
});
