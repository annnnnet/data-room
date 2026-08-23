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
