export type Crumb = { id: string; name: string };

export type BreadcrumbLayout = {
  /** First crumb in the chain (the data room root), shown before any collapse. */
  first: Crumb | null;
  /** Ancestors collapsed into the overflow menu — still reachable, just not inline. */
  middle: Crumb[];
  /** Ancestors shown inline between `first` and `current` (only when not collapsed). */
  visible: Crumb[];
  /** The folder currently being viewed — rendered as text, never a link. */
  current: Crumb | null;
  collapsed: boolean;
};

/**
 * Splits a root-to-current breadcrumb chain into the pieces `Breadcrumbs`
 * renders: the first crumb always shown, the current crumb always shown
 * (and never a link), and everything in between either shown inline or,
 * past `threshold` total crumbs, collapsed into an overflow menu.
 */
/**
 * Cuts a root-to-current breadcrumb chain down to start at `rootId` — used
 * by the public share view so a link recipient given "Contracts" never sees
 * "Acme Acquisition › Legal" above it. In a due-diligence product the folder
 * structure itself is sensitive, so everything above the share boundary is
 * simply not in the array Breadcrumbs (or the deleted-ancestor walk) ever
 * sees, not just hidden by styling.
 *
 * Falls back to the untrimmed chain if `rootId` isn't present — that would
 * mean the current node is outside the shared subtree, which the API's
 * access check should already have prevented.
 */
export function trimBreadcrumbsToRoot(breadcrumbs: Crumb[], rootId: string): Crumb[] {
  const index = breadcrumbs.findIndex((c) => c.id === rootId);
  return index === -1 ? breadcrumbs : breadcrumbs.slice(index);
}

export function buildBreadcrumbLayout(breadcrumbs: Crumb[], threshold = 4): BreadcrumbLayout {
  if (breadcrumbs.length === 0) {
    return { first: null, middle: [], visible: [], current: null, collapsed: false };
  }

  const current = breadcrumbs[breadcrumbs.length - 1];
  const ancestors = breadcrumbs.slice(0, -1);
  const collapsed = breadcrumbs.length > threshold;
  const first = ancestors[0] ?? null;
  const middle = collapsed ? ancestors.slice(1) : [];
  const visible = collapsed ? [] : ancestors.slice(1);

  return { first, middle, visible, current, collapsed };
}
