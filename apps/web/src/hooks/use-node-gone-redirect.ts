'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { NodeDetail } from '@data-room/shared';
import { ApiError, api } from '@/lib/api';
import { toast } from '@/components/ui/toast';
import { ancestorCandidates } from '@/components/browser/ancestor-walk';

export type GoneRedirectState = 'checking' | 'redirecting' | 'gone';

/**
 * On `NODE_GONE`, walks outward through the last-known breadcrumb trail
 * (nearest ancestor first) probing each with a real request until one
 * still resolves, then toasts and redirects there. Falls back to `basePath`
 * alone (no id) when the trail has candidates but none of them survive (or
 * nothing was cached at all — e.g. a direct link to an already-deleted
 * node); that route has its own terminal "not found" state as a last
 * resort, for the owner view.
 *
 * When the trail has *no* candidates at all — the gone node is itself the
 * top of the visible chain, with nothing above it left to try — there is
 * nothing `basePath` could show that isn't the very node that just 410'd.
 * On a share this is the share's own root: `basePath` (`/s/{token}/f`, no
 * id) resolves right back to that same root and 410s again, forever, since
 * nothing here or in the route ever changes state after that. This is
 * exactly the scenario that used to loop — `'gone'` gives it the terminal
 * state it was missing, instead of attempting a redirect that can only ever
 * land on the thing that's already gone.
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
      // The gone node's own (trimmed) breadcrumb trail had nothing above
      // it — it *was* the top of the visible chain (a share's own root, or
      // — degenerately — the room root). Unlike "nothing was cached at all"
      // below, `basePath` here would resolve right back to this same gone
      // node, not to some other, presumably-alive root, so a redirect
      // would only loop. Stop at a terminal state instead.
      if (lastKnown && lastKnown.breadcrumbs.length <= 1) {
        if (cancelled) return;
        setState('gone');
        return;
      }

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
