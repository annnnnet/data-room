import type { Crumb } from './breadcrumb-utils';

/**
 * Given the last-known root-to-current breadcrumb chain for a node that
 * just 410'd, returns the ancestor ids to probe, nearest first — i.e. the
 * immediate parent, then its parent, out to the data room root. The
 * current (now-gone) node itself is excluded.
 */
export function ancestorCandidates(breadcrumbs: Crumb[]): string[] {
  return breadcrumbs
    .slice(0, -1)
    .map((c) => c.id)
    .reverse();
}
