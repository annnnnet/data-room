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
      // Atomic INSERT ... ON CONFLICT DO UPDATE: two concurrent requests for
      // the same brand-new sub (two tabs, or parallel calls right after
      // first sign-in) both land here safely instead of racing a
      // findUnique-then-create, where the loser would hit a raw P2002 on
      // supabaseSub.
      const user = await this.prisma.user.upsert({
        where: { supabaseSub: sub },
        create: { supabaseSub: sub, email, name: meta.full_name, avatarUrl: meta.avatar_url },
        update: { email, name: meta.full_name, avatarUrl: meta.avatar_url },
      });

      // Gating reconciliation on "row was just created" is a permanent
      // trap: a user who first signs in unverified gets their row created
      // then, so `!existing` is never true again on any later call — even
      // once they verify, their pending invites stay dead forever. Instead,
      // gate on "is there actually anything to reconcile": a verified email
      // plus at least one pending share for it. Share.granteeEmail is
      // indexed (see migration 20260823000000_...), so this is a cheap
      // index probe that returns nothing on the overwhelming majority of
      // requests and never writes when there's nothing pending.
      if (emailVerified) {
        const pending = await this.prisma.share.findFirst({
          where: { granteeEmail: email, granteeUserId: null },
          select: { id: true },
        });
        if (pending) {
          await this.reconcilePendingShares(user);
        }
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
