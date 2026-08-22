import { Injectable } from '@nestjs/common';
import type { JWTPayload } from 'jose';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  /** The local User row is the FK target for ownership and shares. */
  async upsertFromClaims(claims: JWTPayload) {
    const sub = String(claims.sub);
    const email = String(claims.email ?? `${sub}@unknown.local`);
    const meta = (claims.user_metadata ?? {}) as Record<string, string>;

    return this.prisma.user.upsert({
      where: { supabaseSub: sub },
      update: { email, name: meta.full_name, avatarUrl: meta.avatar_url },
      create: { supabaseSub: sub, email, name: meta.full_name, avatarUrl: meta.avatar_url },
    });
  }
}
