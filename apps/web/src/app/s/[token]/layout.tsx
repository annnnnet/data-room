import type { ReactNode } from 'react';
import { ShareTokenProvider } from '@/lib/share-token';

/**
 * Owns the share token for both `/s/[token]` and `/s/[token]/f/[...nodeId]`
 * — the only place `ShareTokenProvider` is mounted, so nothing downstream
 * needs (or is allowed) to call `setShareToken` itself. See
 * `ShareTokenProvider`'s doc comment for why a second owner broke this.
 *
 * `referrer: origin` keeps the token-bearing URL out of the `Referer`
 * header sent by anything a preview links off to (an embedded PDF, an
 * external download target) — this is a public URL that shouldn't be
 * relied on browser defaults alone to protect.
 */
export const metadata = {
  referrer: 'origin' as const,
};

export default async function ShareTokenLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ShareTokenProvider token={token}>{children}</ShareTokenProvider>;
}
