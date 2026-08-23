'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ShareContext } from '@data-room/shared';
import { api, setShareToken } from '@/lib/api';

/**
 * Resolves a public share token to what it grants access to, and arms the
 * API client to send it as `X-Share-Token` on every request for as long as
 * this hook is mounted — cleared again on unmount so an anonymous share
 * token never leaks into a later authenticated request from the same tab.
 *
 * `retry: false` — a revoked/expired/unknown token or a deleted target
 * (`SHARE_REVOKED` / `NODE_GONE`) is a terminal state, not a transient
 * failure worth retrying.
 */
export function useShareContext(token: string) {
  useEffect(() => {
    setShareToken(token || null);
    return () => setShareToken(null);
  }, [token]);

  return useQuery({
    queryKey: ['share-context', token],
    queryFn: () => api.get<ShareContext>(`/api/shares/context?token=${encodeURIComponent(token)}`),
    retry: false,
    enabled: token.length > 0,
  });
}
