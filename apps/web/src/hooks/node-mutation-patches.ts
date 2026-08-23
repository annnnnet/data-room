import type { NodeDto } from '@data-room/shared';

/**
 * A row as it can appear in the cached `['children', parentId]` pages —
 * either a plain server-shaped `NodeDto`, or one carrying `_pending: true`
 * while a move/delete against it is in flight. `_pending` is a client-only
 * marker (never part of the API response) so the UI can show the row as
 * "about to disappear" instead of yanking it out of the table the instant
 * `.mutate()` fires, only to have it pop back on a rollback.
 */
export type PendingNode = NodeDto & { _pending?: boolean };

export type Page = { items: PendingNode[]; nextCursor: string | null };
export type Pages = { pages: Page[] };

/**
 * Pure reducers over the `['children', parentId]` infinite-query cache
 * shape (`{ pages: [{ items, nextCursor }, ...] }`). Each returns a new
 * `Pages` without touching the input, so the pre-mutation object captured
 * by `onMutate` in `useNodeMutations` stays a valid snapshot to restore on
 * rollback.
 */

export function renamePatch(pages: Pages, vars: { id: string; name: string }): Pages {
  return {
    pages: pages.pages.map((p) => ({
      ...p,
      items: p.items.map((n) => (n.id === vars.id ? { ...n, name: vars.name } : n)),
    })),
  };
}

export function removePatch(pages: Pages, vars: { id: string }): Pages {
  return {
    pages: pages.pages.map((p) => ({ ...p, items: p.items.filter((n) => n.id !== vars.id) })),
  };
}

export function movePatch(pages: Pages, vars: { id: string; parentId: string }): Pages {
  // Moving a node out of the current folder is represented the same way
  // as a delete from this list's point of view: it drops out of the page.
  return removePatch(pages, vars);
}

/**
 * Marks the matching row as pending instead of removing it — used as the
 * optimistic patch for remove/move so a failure's rollback doesn't read as
 * "the row vanished, then popped back". The row is actually dropped once
 * the server confirms (the mutation's `onSettled` invalidation refetches
 * without it); if the mutation instead fails, `onError`'s rollback restores
 * the pre-mutation snapshot, which clears the flag along with everything
 * else.
 */
export function markPendingPatch(pages: Pages, vars: { id: string }): Pages {
  return {
    pages: pages.pages.map((p) => ({
      ...p,
      items: p.items.map((n) => (n.id === vars.id ? { ...n, _pending: true } : n)),
    })),
  };
}
