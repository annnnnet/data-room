import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { User } from '@prisma/client';
import type { JWTPayload } from 'jose';
import { AppError } from '../common/api-error';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  /** The local User row is the FK target for ownership and shares. */
  async upsertFromClaims(claims: JWTPayload) {
    const sub = String(claims.sub);
    const email = String(claims.email ?? `${sub}@unknown.local`);
    const meta = (claims.user_metadata ?? {}) as Record<string, string>;

    try {
      const user = await this.prisma.user.upsert({
        where: { supabaseSub: sub },
        update: { email, name: meta.full_name, avatarUrl: meta.avatar_url },
        create: { supabaseSub: sub, email, name: meta.full_name, avatarUrl: meta.avatar_url },
      });
      await this.reconcilePendingShares(user);
      return user;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        (err.meta?.target as string[] | undefined)?.includes('email')
      ) {
        throw new AppError(
          'VALIDATION_FAILED',
          `An account with the email address ${email} already exists.`,
          409,
        );
      }
      throw err;
    }
  }

  /**
   * An invite (`Share.granteeEmail`) may be created before that person ever
   * signs up, so it can only carry an email, not a userId. Once someone
   * authenticates, point every one of their pending invites at the real
   * user row — otherwise the share silently never grants anything for a
   * person who was invited before they registered.
   */
  async reconcilePendingShares(user: User): Promise<void> {
    await this.prisma.share.updateMany({
      where: { granteeEmail: user.email, granteeUserId: null },
      data: { granteeUserId: user.id },
    });
  }
}
