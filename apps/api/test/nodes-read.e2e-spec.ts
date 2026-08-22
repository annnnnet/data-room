import { createTestApp, TestApp, seedTree } from './helpers';

describe('node reads', () => {
  let app: TestApp;
  beforeAll(async () => { app = await createTestApp(); });
  afterAll(() => app.close());

  it('lists children with folders before files, alphabetically', async () => {
    // Mixed case on purpose: uppercase folder names and a lowercase folder
    // name ('archive'), plus an uppercase file name ('Zeta.pdf') mixed with
    // lowercase ones. Under ASCII/C-collation ordering, name-only sorting
    // would place 'Zeta.pdf' before 'archive' — but type-then-name ordering
    // must keep every folder before every file regardless. This makes the
    // two orderings diverge, so an implementation that dropped `type` from
    // the ORDER BY would fail this assertion instead of passing it by luck.
    const { root } = await seedTree(app, {
      folders: ['Legal', 'Financials', 'archive'],
      files: ['b.pdf', 'a.pdf', 'Zeta.pdf'],
    });
    // The DB's collation sorts case-insensitively (archive < Financials <
    // Legal; a.pdf < b.pdf < Zeta.pdf), so type-then-name here comes out as
    // below — still decisively different from name-only sorting, which
    // would interleave folders and files as: a.pdf, archive, b.pdf,
    // Financials, Legal, Zeta.pdf.
    const res = await app.asOwner().get(`/api/nodes/${root}/children`).expect(200);
    expect(res.body.items.map((n: any) => n.name)).toEqual([
      'archive', 'Financials', 'Legal', 'a.pdf', 'b.pdf', 'Zeta.pdf',
    ]);
  });

  it('paginates by keyset without repeating or skipping a row', async () => {
    // A folder/file mix (12 folders + 13 files) so that, at limit 10, page
    // boundaries land mid-folders (page 1/2) and mid-files (page 2/3) — and
    // the folder-to-file transition inside a single page (page 2 contains
    // both the last two folders and the first eight files) exercises the
    // `type: { in: [...] }` branch that advances the keyset from folders
    // into files. Zero-padded names keep lexical order == numeric order.
    const folders = Array.from({ length: 12 }, (_, i) => `folder${String(i).padStart(2, '0')}`);
    const files = Array.from({ length: 13 }, (_, i) => `file${String(i).padStart(2, '0')}`);
    const { root } = await seedTree(app, { folders, files });

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const url = `/api/nodes/${root}/children?limit=10${cursor ? `&cursor=${cursor}` : ''}`;
      const res: any = await app.asOwner().get(url).expect(200);
      seen.push(...res.body.items.map((n: any) => n.name));
      cursor = res.body.nextCursor;
    } while (cursor);

    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
    expect(seen).toEqual([...folders, ...files]);
  });

  it('advances the keyset cleanly when a page boundary lands exactly on the last folder', async () => {
    const folders = Array.from({ length: 12 }, (_, i) => `folder${String(i).padStart(2, '0')}`);
    const files = Array.from({ length: 13 }, (_, i) => `file${String(i).padStart(2, '0')}`);
    const { root } = await seedTree(app, { folders, files });

    // limit=12 exactly matches the folder count, so page 1's cursor sits on
    // the very last folder — the boundary case where the OR clause's first
    // branch (`type in <types after cursor.type>`) must fire with nothing
    // left in the FOLDER type to also match on name/id.
    const page1 = await app.asOwner().get(`/api/nodes/${root}/children?limit=12`).expect(200);
    expect(page1.body.items.map((n: any) => n.name)).toEqual(folders);
    expect(page1.body.nextCursor).not.toBeNull();

    const page2 = await app
      .asOwner()
      .get(`/api/nodes/${root}/children?limit=12&cursor=${page1.body.nextCursor}`)
      .expect(200);
    expect(page2.body.items.map((n: any) => n.name)).toEqual(files.slice(0, 12));
  });

  it('returns breadcrumbs from the root down to the node', async () => {
    const { root, nested } = await seedTree(app, { nested: ['Legal', 'Contracts'] });
    const res = await app.asOwner().get(`/api/nodes/${nested}`).expect(200);
    expect(res.body.breadcrumbs.map((b: any) => b.name)).toEqual([
      'Acme Acquisition', 'Legal', 'Contracts',
    ]);
    expect(res.body.breadcrumbs[0].id).toBe(root);
  });

  it('aggregates subtree stats across the whole tree', async () => {
    const { root } = await seedTree(app, {
      nested: ['Legal', 'Contracts'],
      nestedFiles: [{ name: 'msa.pdf', size: 1000 }, { name: 'nda.pdf', size: 500 }],
    });
    const res = await app.asOwner().get(`/api/nodes/${root}/stats`).expect(200);
    expect(res.body).toEqual({ fileCount: 2, folderCount: 2, totalBytes: 1500 });
  });

  it('gives a stranger 404, not 403', async () => {
    const { root } = await seedTree(app, {});
    const res = await app.asStranger().get(`/api/nodes/${root}/children`).expect(404);
    expect(res.body.code).toBe('NODE_NOT_FOUND');
  });

  it('gives an anonymous caller 404 too', async () => {
    const { root } = await seedTree(app, {});
    const res = await app.asAnonymous().get(`/api/nodes/${root}/children`).expect(404);
    expect(res.body.code).toBe('NODE_NOT_FOUND');
  });

  describe('children query validation', () => {
    it('rejects a non-numeric limit', async () => {
      const { root } = await seedTree(app, {});
      const res = await app.asOwner().get(`/api/nodes/${root}/children?limit=abc`).expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('rejects a negative limit', async () => {
      const { root } = await seedTree(app, {});
      const res = await app.asOwner().get(`/api/nodes/${root}/children?limit=-5`).expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('rejects a limit above the max', async () => {
      const { root } = await seedTree(app, {});
      const res = await app.asOwner().get(`/api/nodes/${root}/children?limit=99999`).expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('rejects a malformed cursor instead of silently serving page 1', async () => {
      const { root } = await seedTree(app, { files: ['a.pdf', 'b.pdf'] });
      const res = await app
        .asOwner()
        .get(`/api/nodes/${root}/children?cursor=garbage`)
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });
});
