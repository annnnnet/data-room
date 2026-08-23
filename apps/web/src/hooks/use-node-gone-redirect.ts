'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { NodeDetail } from '@data-room/shared';
import { ApiError, api } from '@/lib/api';
import { toast } from '@/components/ui/toast';
import { ancestorCandidates } from '@/components/browser/ancestor-walk';

export type GoneRedirectState = 'checking' | 'redirecting';

/**
 * On `NODE_GONE`, walks outward through the last-known breadcrumb trail
 * (nearest ancestor first) probing each with a real request until one
 * still resolves, then toasts and redirects there. Falls back to `basePath`
 * alone (no id) when nothing in the trail survives (or nothing was cached
 * at all — e.g. a direct link to an already-deleted node); that route has
 * its own terminal "not found" state as a last resort.
 *
 * `basePath` is the folder route prefix to redirect within — `/r/{roomId}/f`
 * for the owner view, `/s/{token}/f` for a share. `lastKnown.breadcrumbs`
 * is expected to already be trimmed to the share root where one applies
 * (see `FolderBrowser`), so the walk can never climb above it.
 */
export function useNodeGoneRedirect({
  basePath,
  active,
  lastKnown,
}: {
  basePath: string;
  active: boolean;
  lastKnown: NodeDetail | undefined;
}): GoneRedirectState {
  const router = useRouter();
  const [state, setState] = useState<GoneRedirectState>('checking');
  const handledFor = useRef<string | null>(null);

  useEffect(() => {
    if (!active) {
      handledFor.current = null;
      return;
    }

    const marker = lastKnown?.id ?? 'unknown';
    if (handledFor.current === marker) return; // already walking/walked for this occurrence
    handledFor.current = marker;

    let cancelled = false;
    setState('checking');

    (async () => {
      const candidates = lastKnown ? ancestorCandidates(lastKnown.breadcrumbs) : [];
      let survivorId: string | null = null;

      for (const id of candidates) {
        try {
          await api.get(`/api/nodes/${id}`);
          survivorId = id;
          break;
        } catch (err) {
          if (err instanceof ApiError && (err.code === 'NODE_GONE' || err.status === 404)) {
            continue; // this ancestor is gone too — keep walking outward
          }
          break; // an unrelated failure — stop probing, fall back to the room root
        }
      }

      if (cancelled) return;

      toast.add({ title: 'This folder was deleted by the owner', type: 'error' });
      setState('redirecting');
      router.replace(survivorId ? `${basePath}/${survivorId}` : basePath);
    })();

    return () => {
      cancelled = true;
    };
  }, [active, lastKnown, basePath, router]);

  return state;
}
