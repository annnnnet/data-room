const mockJwtVerify = jest.fn();
const mockCreateRemoteJWKSet = jest.fn().mockReturnValue('the-jwks-set');

jest.mock('jose', () => ({
  jwtVerify: (...args: unknown[]) => mockJwtVerify(...args),
  createRemoteJWKSet: (...args: unknown[]) => mockCreateRemoteJWKSet(...args),
}));

import { JwtVerifierService } from './jwt-verifier.service';

describe('JwtVerifierService', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...OLD_ENV,
      SUPABASE_URL: 'https://project-ref.supabase.co',
      SUPABASE_JWKS_URL: 'https://project-ref.supabase.co/auth/v1/.well-known/jwks.json',
    };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('verifies with the expected issuer and audience derived from SUPABASE_URL', async () => {
    mockJwtVerify.mockResolvedValue({ payload: { sub: 'u1' } });
    const service = new JwtVerifierService();

    await service.verify('token');

    expect(mockJwtVerify).toHaveBeenCalledWith(
      'token',
      'the-jwks-set',
      expect.objectContaining({
        issuer: 'https://project-ref.supabase.co/auth/v1',
        audience: 'authenticated',
      }),
    );
  });

  // Enforcement of iss/aud lives inside jose, not here. What this codebase owns
  // is passing the right options (asserted above) and not swallowing a rejection.
  it('propagates a verification failure instead of returning a payload', async () => {
    mockJwtVerify.mockRejectedValue(new Error('unexpected "iss" claim value'));
    const service = new JwtVerifierService();

    await expect(service.verify('bad-token')).rejects.toThrow('unexpected "iss" claim value');
  });

  it('creates the remote JWKS set lazily and only once across multiple verify calls', async () => {
    mockJwtVerify.mockResolvedValue({ payload: { sub: 'u1' } });
    const service = new JwtVerifierService();

    expect(mockCreateRemoteJWKSet).not.toHaveBeenCalled();

    await service.verify('token1');
    await service.verify('token2');

    expect(mockCreateRemoteJWKSet).toHaveBeenCalledTimes(1);
  });
});
