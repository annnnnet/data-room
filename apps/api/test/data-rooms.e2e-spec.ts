import { createTestApp, TestApp, seedTree } from './helpers';

describe('data rooms', () => {
  let app: TestApp;
  beforeAll(async () => { app = await createTestApp(); });
  afterAll(() => app.close());

  it('creates a data room with a root node, via POST /api/data-rooms', async () => {
    // Seed a user first so we have a tracked owner id — the room this test
    // creates is deliberately NOT added to app._roomIds, exercising the
    // teardown path that must find it by ownerId instead.
    await seedTree(app, {});

    const res = await app
      .asOwner()
      .post('/api/data-rooms')
      .send({ name: 'Untracked Room' })
      .expect(201);

    expect(res.body).toMatchObject({
      name: 'Untracked Room',
      isOwner: true,
    });
    expect(typeof res.body.id).toBe('string');
    expect(res.body.id.length).toBeGreaterThan(0);
    expect(typeof res.body.rootNodeId).toBe('string');
    expect(res.body.rootNodeId.length).toBeGreaterThan(0);
    expect(typeof res.body.createdAt).toBe('string');

    const list = await app.asOwner().get('/api/data-rooms').expect(200);
    expect(list.body.some((r: any) => r.id === res.body.id)).toBe(true);
  });
});
