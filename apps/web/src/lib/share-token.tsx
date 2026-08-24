'use client';

import { useEffect, type ReactNode } from 'react';
import { setShareToken } from './api';

/**
 * Supplies a share token to the API client for the lifetime of the /s
 * subtree it wraps. This is the *only* thing allowed to call
 * `setShareToken` — a second, competing caller (there used to be one, deep
 * in `useShareContext`) raced this component's own effect: passive effects
 * flush child-first, so the deeper caller armed the real token first and
 * this component's effect then clobbered it with `null` right after, and
 * neither ever ran again since their dependency arrays never changed. The
 * share page was permanently unauthenticated as a result.
 *
 * Armed synchronously during render, not only in an effect: effects still
 * flush child-first, so a descendant's own mount effect (e.g. a query
 * that fires its first request on mount) could otherwise run before this
 * component's effect does. Setting the module state during render means
 * every request issued from this point on — including one fired from a
 * child's mount effect in the same commit — already sees the real token.
 * `setShareToken` is a plain, idempotent assignment, so calling it again on
 * every render is harmless.
 *
 * Also re-armed at the top of the effect, not just in render: in
 * development, React StrictMode synthetically mount → cleans up → re-mounts
 * every effect once, to surface exactly this kind of unsafe assumption. The
 * synthetic cleanup runs this component's own `() => setShareToken(null)`
 * teardown, and since arming only ever happened in render (which StrictMode
 * does *not* re-run for this cycle), the token was left permanently wiped
 * before any descendant's real network request ever went out — a guest
 * visiting a valid share link got a 404 on every follow-up request, even
 * though `/api/shares/context` (which needs no token) had just succeeded.
 * Re-arming here means the synthetic remount's own mount phase restores the
 * token the synthetic cleanup just cleared, so the net effect of the
 * mount → cleanup → mount cycle is a no-op, exactly as an idempotent effect
 * is supposed to behave — and a genuine unmount (leaving the /s subtree)
 * still nulls the token via the same cleanup, since no further mount
 * follows it.
 */
export function ShareTokenProvider({
  token,
  children,
}: {
  token: string | null;
  children: ReactNode;
}) {
  setShareToken(token);

  useEffect(() => {
    setShareToken(token);
    return () => setShareToken(null);
  }, [token]);

  return <>{children}</>;
}
