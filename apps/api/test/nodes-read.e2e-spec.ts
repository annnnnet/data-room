import { createTestApp, TestApp, seedTree } from './helpers';

describe('node reads', () => {
  let app: TestApp;
  beforeAll(async () => { app = await createTestApp(); });
  afterAll(() => app.close());

  it('lists children with folders before files, alphabetically', async () => {
    const { root } = await seedTree(app, {
      folders: ['Legal', 'Financials'],
      files: ['b.pdf', 'a.pdf'],
    });
    const res = await app.asOwner().get(`/api/nodes/${root}/children`).expect(200);
    expect(res.body.items.map((n: any) => n.name)).toEqual([
      'Financials', 'Legal', 'a.pdf', 'b.pdf',
    ]);
  });

  it('paginates by keyset without repeating or skipping a row', async () => {
    const { root } = await seedTree(app, { files: Array.from({ length: 25 }, (_, i) => `f${i}.pdf`) });
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
    await app.asStranger().get(`/api/nodes/${root}/children`).expect(404);
  });
});
