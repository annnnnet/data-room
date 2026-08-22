/**
 * Materialized path format: `/rootId/childId/leafId/`.
 * Leading and trailing slashes are always present, which is what makes
 * prefix comparison safe — `/root/ab/` can never prefix-match `/root/abc/`.
 */
export function buildPath(parentPath: string | null, id: string): string {
  return parentPath === null ? `/${id}/` : `${parentPath}${id}/`;
}

export function ancestorIds(path: string): string[] {
  const ids = path.split('/').filter(Boolean);
  return ids.slice(0, -1);
}

export function isSelfOrDescendant(candidatePath: string, ancestorPath: string): boolean {
  return candidatePath.startsWith(ancestorPath);
}

export function subtreePrefix(path: string): string {
  return path;
}
