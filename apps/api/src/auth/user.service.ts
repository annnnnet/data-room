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
    // Postgres' unique index on User.email is case-sensitive; normalise to
    // lowercase on every write so it matches how invites are stored (see
    // SharesService.create) and reconciliation below compares consistently.
    const email = String(claims.email ?? `${sub}@unknown.local`).toLowerCase();
    const meta = (claims.user_metadata ?? {}) as Record<string, string>;
    // Supabase's GoTrue puts a top-level `email_verified` boolean on the
    // access-token JWT that reflects the *account's* confirmed status
    // (auth.users.email_confirmed_at), separate from
    // `user_metadata.email_verified`, which can be whatever an OAuth
    // provider (or, for a password sign-up, the client itself) supplied at
    // signup time and must not be trusted for authorization. Only the
    // top-level claim is treated as a verification signal here; anything
    // else — missing, not `true`, or only present under user_metadata — is
    // treated as unverified.
    const emailVerified = claims.email_verified === true;

    try {
      // upsert() alone can't tell us whether it created or updated the row,
      // and that distinction is exactly the gate we need: reconciliation
      // issues a write against every pending-invite row for this email, so
      // it must not run on the hot path of "already-registered user makes
      // an API call" — only at the one moment it can matter, when the user
      // row is first created and their address is confirmed.
      const existing = await this.prisma.user.findUnique({ where: { supabaseSub: sub } });
      const user = existing
        ? await this.prisma.user.update({
            where: { supabaseSub: sub },
            data: { email, name: meta.full_name, avatarUrl: meta.avatar_url },
          })
        : await this.prisma.user.create({
            data: { supabaseSub: sub, email, name: meta.full_name, avatarUrl: meta.avatar_url },
          });

      if (!existing && emailVerified) {
        await this.reconcilePendingShares(user);
      }
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
