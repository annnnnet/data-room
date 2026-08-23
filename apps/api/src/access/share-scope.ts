import type { Principal } from '../auth/auth.guard';

/**
 * The Prisma `where` fragment for "a live share matching this principal" —
 * revoked or expired shares never match, and the principal-kind branch
 * picks the right identity column. Shared by `AccessService.resolve`
 * (single-node access checks) and `SearchService.scopePrefixes`
 * (subtree-scope resolution for search) so the two can never silently
 * diverge on what counts as a live, matching share — a divergence there
 * would mean a viewer keeps node access while search silently 404s them,
 * or vice versa.
 *
 * Callers must reject `principal.kind === 'anonymous'` and an empty-token
 * `link` principal *before* calling this — that discipline stays next to
 * each call site's own 404 handling rather than living here, since an
 * `undefined` token slipping into a Prisma `where` means "omit this
 * filter" (matching any live share), not "match nothing".
 */
export function liveShareForPrincipal(principal: Exclude<Principal, { kind: 'anonymous' }>) {
  return {
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    ...(principal.kind === 'user'
      ? { granteeUserId: principal.userId }
      : { token: principal.shareToken }),
  };
}
