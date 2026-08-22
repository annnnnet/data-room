import { Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

@Injectable()
export class JwtVerifierService {
  private _jwks?: ReturnType<typeof createRemoteJWKSet>;

  private get jwks() {
    if (!this._jwks) {
      this._jwks = createRemoteJWKSet(new URL(process.env.SUPABASE_JWKS_URL!));
    }
    return this._jwks;
  }

  async verify(token: string): Promise<JWTPayload> {
    const { payload } = await jwtVerify(token, this.jwks);
    return payload;
  }
}
