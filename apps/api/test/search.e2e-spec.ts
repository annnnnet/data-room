import { randomUUID } from 'node:crypto';
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
    // Positive control: prove 'Archive Room' actually exists and is
    // findable (by the owner, who searches the whole room) before asserting
    // the viewer can't see it — otherwise a seeding regression that dropped
    // 'Archive Room' entirely would make the viewer assertion below pass
    // vacuously.
    const ownerRes = await app
      .asOwner()
      .get(`/api/search?dataRoomId=${roomId}&q=archive`)
      .expect(200);
    expect(ownerRes.body.items.map((n: any) => n.name)).toEqual(['Archive Room']);

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

  it('rejects an anonymous caller with 404, never a bare empty page', async () => {
    const { roomId } = await seedTree(app, { files: ['msa.pdf'] });
    const res = await app.asAnonymous().get(`/api/search?dataRoomId=${roomId}&q=msa`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NODE_NOT_FOUND');
  });

  it('scopes a link principal to the shared subtree, finding matches inside it', async () => {
    const { roomId, nested } = await seedTree(app, {
      nested: ['Legal', 'Contracts'],
      nestedFiles: [{ name: 'nda-agreement.pdf', size: 1 }],
      folders: ['Archive Room'],
    });
    const token = randomUUID();
    await app.prisma.share.create({
      data: { nodeId: nested!, kind: 'LINK', token, role: 'VIEWER', createdById: app.ownerId },
    });

    const inside = await app
      .asLink(token)
      .get(`/api/search?dataRoomId=${roomId}&q=agreement`)
      .expect(200);
    expect(inside.body.items.map((n: any) => n.name)).toEqual(['nda-agreement.pdf']);

    const outside = await app
      .asLink(token)
      .get(`/api/search?dataRoomId=${roomId}&q=archive`)
      .expect(200);
    expect(outside.body.items).toHaveLength(0);
  });

  it('404s search for a revoked share', async () => {
    const { roomId, nested, nestedViewerId } = await seedTree(app, {
      nested: ['Legal', 'Contracts'],
      nestedFiles: [{ name: 'nda-agreement.pdf', size: 1 }],
      shareNestedWith: 'searchrevoked',
    });
    const share = await app.prisma.share.findFirstOrThrow({ where: { nodeId: nested! } });
    await app.asOwner().delete(`/api/shares/${share.id}`).expect(200);

    const res = await app
      .asUser(nestedViewerId!)
      .get(`/api/search?dataRoomId=${roomId}&q=agreement`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NODE_NOT_FOUND');
  });

  it('404s search for an expired share', async () => {
    const { roomId, nested, nestedViewerId } = await seedTree(app, {
      nested: ['Legal', 'Contracts'],
      nestedFiles: [{ name: 'nda-agreement.pdf', size: 1 }],
      shareNestedWith: 'searchexpired',
    });
    // The API rejects a past expiresAt on create (see shares.e2e-spec.ts),
    // so an already-expired share can only be produced by writing it
    // directly, same as an already-revoked one above.
    await app.prisma.share.updateMany({
      where: { nodeId: nested!, granteeUserId: nestedViewerId! },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const res = await app
      .asUser(nestedViewerId!)
      .get(`/api/search?dataRoomId=${roomId}&q=agreement`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NODE_NOT_FOUND');
  });

  it('does not let a bare "%" search return every row in scope', async () => {
    const { roomId } = await seedTree(app, {
      files: ['Master Services Agreement.pdf', 'Employee Handbook.pdf'],
    });
    const res = await app
      .asOwner()
      .get(`/api/search?dataRoomId=${roomId}&q=${encodeURIComponent('%')}`)
      .expect(200);
    expect(res.body.items).toHaveLength(0);
  });

  it('finds a filename that literally contains "%" or "_" by its literal name', async () => {
    const { roomId } = await seedTree(app, {
      files: ['50%_off.pdf', 'unrelated.pdf'],
    });
    const res = await app.asOwner().get(`/api/search?dataRoomId=${roomId}&q=${encodeURIComponent('50%_off')}`).expect(200);
    expect(res.body.items.map((n: any) => n.name)).toEqual(['50%_off.pdf']);
  });

  it('paginates past the first page with no row skipped or duplicated, ending in nextCursor: null', async () => {
    const names = Array.from({ length: 25 }, (_, i) => `Pageable ${String(i).padStart(2, '0')}.pdf`);
    const { roomId } = await seedTree(app, { files: names });

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const qs = cursor
        ? `dataRoomId=${roomId}&q=Pageable&limit=10&cursor=${encodeURIComponent(cursor)}`
        : `dataRoomId=${roomId}&q=Pageable&limit=10`;
      const res: any = await app.asOwner().get(`/api/search?${qs}`).expect(200);
      seen.push(...res.body.items.map((n: any) => n.name));
      cursor = res.body.nextCursor;
      pages += 1;
      expect(pages).toBeLessThan(10); // guards against an infinite loop on a bug
    } while (cursor);

    expect(pages).toBe(3); // 25 rows at 10/page: 10 + 10 + 5
    expect(seen).toHaveLength(names.length);
    expect(new Set(seen).size).toBe(names.length); // no duplicates across pages
    expect(seen.sort()).toEqual([...names].sort());
  });
});
