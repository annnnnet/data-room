'use client';

import { useEffect } from 'react';

const DEFAULT_TITLE = 'Browse – Data Room';

/**
 * Reflects the folder currently being viewed in the tab title, falling
 * back to `fallback` (default: the owner-view static title) while the
 * folder name isn't known yet.
 *
 * `fallback` must match whatever `page.tsx`'s own `metadata.title` set for
 * the route this is mounted under — this effect runs on every mount,
 * including the very first one, and unconditionally overwrites
 * `document.title`. On the share routes the SSR title is "Shared item –
 * Data Room", not the owner-view default; passing the matching fallback
 * there is what keeps this from clobbering it with the wrong title for the
 * brief window before the folder's real name resolves.
 */
export function useDocumentTitle(name: string | undefined, fallback: string = DEFAULT_TITLE) {
  useEffect(() => {
    document.title = name ? `${name} – Data Room` : fallback;
  }, [name, fallback]);
}
