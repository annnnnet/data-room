import type { NodeDto } from '@data-room/shared';

export type Page = { items: NodeDto[]; nextCursor: string | null };
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
