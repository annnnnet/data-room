'use client';

import { useQuery } from '@tanstack/react-query';
import type { ShareContext } from '@data-room/shared';
import { api } from '@/lib/api';

/**
 * Resolves a public share token to what it grants access to. Arming the API
 * client to send the token as `X-Share-Token` is owned entirely by
 * `ShareTokenProvider` (mounted once, in the `/s/[token]` layout) — this
 * hook must not also call `setShareToken`, since two effects racing to own
 * the same module-level value is exactly what left the share page
 * permanently unauthenticated (see `ShareTokenProvider`'s doc comment).
 *
 * `retry: false` — a revoked/expired/unknown token or a deleted target
 * (`SHARE_REVOKED` / `NODE_GONE`) is a terminal state, not a transient
 * failure worth retrying.
 */
export function useShareContext(token: string) {
  return useQuery({
    queryKey: ['share-context', token],
    queryFn: () => api.get<ShareContext>(`/api/shares/context?token=${encodeURIComponent(token)}`),
    retry: false,
    enabled: token.length > 0,
  });
}
