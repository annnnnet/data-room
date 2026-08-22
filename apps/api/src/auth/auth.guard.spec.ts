import { AuthGuard } from './auth.guard';

function ctxWith(headers: Record<string, string>) {
  const req: any = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    _req: req,
  } as any;
}

describe('AuthGuard', () => {
  const users = { upsertFromClaims: jest.fn().mockResolvedValue({ id: 'u1' }) } as any;
  const verify = jest.fn();
  const guard = new AuthGuard(users, { verify } as any);

  beforeEach(() => jest.clearAllMocks());

  it('produces a user principal from a valid bearer token', async () => {
    verify.mockResolvedValue({ sub: 'sub-1', email: 'a@b.c' });
    const ctx = ctxWith({ authorization: 'Bearer good' });
    await guard.canActivate(ctx);
    expect(ctx._req.principal).toEqual({ kind: 'user', userId: 'u1' });
  });

  it('produces a link principal from a share token header', async () => {
    const ctx = ctxWith({ 'x-share-token': 'tok-abc' });
    await guard.canActivate(ctx);
    expect(ctx._req.principal).toEqual({ kind: 'link', shareToken: 'tok-abc' });
  });

  it('produces an anonymous principal when no credential is present', async () => {
    const ctx = ctxWith({});
    await guard.canActivate(ctx);
    expect(ctx._req.principal).toEqual({ kind: 'anonymous' });
  });

  it('rejects a malformed bearer token', async () => {
    verify.mockRejectedValue(new Error('bad signature'));
    const ctx = ctxWith({ authorization: 'Bearer bad' });
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
