'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { setShareToken } from './api';

const ShareTokenContext = createContext<string | null>(null);

/**
 * Supplies an optional share token to the API client for the lifetime of the
 * subtree. Used on public share routes, where requests are authorized by a
 * link token instead of (or in addition to) a Supabase session.
 */
export function ShareTokenProvider({
  token,
  children,
}: {
  token: string | null;
  children: ReactNode;
}) {
  useEffect(() => {
    setShareToken(token);
    return () => setShareToken(null);
  }, [token]);

  return <ShareTokenContext.Provider value={token}>{children}</ShareTokenContext.Provider>;
}

export function useShareToken(): string | null {
  return useContext(ShareTokenContext);
}
