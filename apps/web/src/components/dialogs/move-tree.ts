/**
 * Pure predicates for the move-tree's "is this candidate a valid
 * destination" question. `path` is the ancestor chain from the tree root
 * down to and including the candidate node itself — the caller builds it
 * incrementally while lazily expanding folders, so a node deep in an
 * unexpanded subtree is never checked against data that hasn't been
 * fetched yet.
 *
 * The server is the enforcement (it re-validates every one of these on
 * `PATCH /nodes/:id`); this only keeps the tree from *offering* a
 * destination that's obviously wrong.
 */
export type MoveGuardOptions = {
  /** The node being moved. */
  movingNodeId: string;
  /** Its current parent — moving it there again is a no-op, not a rejection. */
  currentParentId: string;
};

export function isInvalidMoveDestination(path: string[], opts: MoveGuardOptions): boolean {
  if (path.length === 0) return false;
  const candidateId = path[path.length - 1];
  if (candidateId === opts.currentParentId) return true;
  return path.includes(opts.movingNodeId);
}

/** Human-readable reason for a disabled row, or `null` if it's selectable. */
export function moveDestinationDisabledReason(path: string[], opts: MoveGuardOptions): string | null {
  if (path.length === 0) return null;
  const candidateId = path[path.length - 1];
  if (candidateId === opts.movingNodeId) return "A folder can't be moved into itself";
  if (path.includes(opts.movingNodeId)) return "A folder can't be moved into its own subfolder";
  if (candidateId === opts.currentParentId) return "It's already here";
  return null;
}
