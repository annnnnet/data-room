'use client';

import { useEffect } from 'react';

const DEFAULT_TITLE = 'Browse – Data Room';

/** Reflects the folder currently being viewed in the tab title, falling
 * back to the static default (also the SSR title, from `page.tsx`'s
 * `metadata`) while the folder name isn't known yet. */
export function useDocumentTitle(name: string | undefined) {
  useEffect(() => {
    document.title = name ? `${name} – Data Room` : DEFAULT_TITLE;
  }, [name]);
}
