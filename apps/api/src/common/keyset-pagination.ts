import { encodeCursor, decodeCursor, type Cursor } from '@data-room/shared';
import { AppError } from './api-error';

/** Matches the Prisma schema's declared enum order — FOLDER sorts before FILE. */
export const TYPE_ORDER = ['FOLDER', 'FILE'] as const;

/**
 * Decodes an opaque cursor query param, throwing the standard 400 on a
 * malformed one. Shared by every endpoint that paginates over the
 * (type, name, id) keyset (`NodesService.children`, `SearchService.search`)
 * so "what counts as an invalid cursor" can't quietly diverge between them.
 */
export function parseCursorParam(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  const cursor = decodeCursor(raw);
  if (!cursor) throw new AppError('VALIDATION_FAILED', 'Invalid cursor', 400);
  return cursor;
}

/**
 * Prisma where-fragment for "rows after this keyset cursor" over the
 * (type, name, id) ordering shared by `NodesService.children` and
 * `SearchService.search` — both list nodes with the same
 * `orderBy: [{ type: 'asc' }, { name: 'asc' }, { id: 'asc' }]` and must stay
 * in lockstep, or their pagination would silently desync if either
 * ordering ever changed independently.
 *
 * Prisma's generated enum filter has no `gt`/`lt` (only
 * equals/in/notIn/not — enums aren't treated as ordinal), so the first OR
 * branch is expressed as `type in <types after cursor.type>` instead of
 * `type gt cursor.type`. Same tuple comparison, just phrased in a filter
 * Prisma actually accepts.
 */
export function afterCursorWhere(cursor: Cursor | null) {
  if (!cursor) return {};
  return {
    OR: [
      { type: { in: TYPE_ORDER.slice(TYPE_ORDER.indexOf(cursor.type) + 1) } },
      { type: cursor.type, name: { gt: cursor.name } },
      { type: cursor.type, name: cursor.name, id: { gt: cursor.id } },
    ],
  };
}

/**
 * Splits a `limit + 1`-sized fetch (the standard "fetch one extra row to
 * know if there's a next page" trick) into the page itself and the cursor
 * for the next one.
 */
export function buildPage<T extends { type: 'FOLDER' | 'FILE'; name: string; id: string }>(
  rows: T[],
  limit: number,
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return {
    items,
    nextCursor:
      hasMore && last ? encodeCursor({ type: last.type, name: last.name, id: last.id }) : null,
  };
}
