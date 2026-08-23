import { describe, it, expect } from 'vitest';
import type { NodeDto } from '@data-room/shared';
import { movePatch, removePatch, renamePatch, type Pages } from './node-mutation-patches';

function node(id: string, name: string): NodeDto {
  return {
    id,
    dataRoomId: 'room-1',
    parentId: 'parent-1',
    type: 'FOLDER',
    name,
    updatedAt: new Date(0).toISOString(),
    sizeBytes: null,
    mimeType: null,
    versionCount: null,
  };
}

/** Two pages, as the `['children', parentId]` infinite query caches them. */
function paginatedPages(): Pages {
  return {
    pages: [
      { items: [node('a', 'Alpha'), node('b', 'Beta')], nextCursor: 'cursor-1' },
      { items: [node('c', 'Gamma'), node('d', 'Delta')], nextCursor: null },
    ],
  };
}

describe('renamePatch', () => {
  it('patches the matching row wherever it lands across paginated pages', () => {
    const original = paginatedPages();
    const patched = renamePatch(original, { id: 'c', name: 'Renamed Gamma' });

    expect(patched.pages[0].items.map((n) => n.name)).toEqual(['Alpha', 'Beta']);
    expect(patched.pages[1].items.map((n) => n.name)).toEqual(['Renamed Gamma', 'Delta']);
  });

  it('does not mutate its input — the pre-mutation snapshot stays valid for rollback', () => {
    const original = paginatedPages();
    const snapshot = structuredClone(original);
    renamePatch(original, { id: 'a', name: 'Changed' });
    expect(original).toEqual(snapshot);
  });
});

describe('removePatch', () => {
  it('removes the matching row from whichever page holds it', () => {
    const original = paginatedPages();
    const patched = removePatch(original, { id: 'b' });

    expect(patched.pages[0].items.map((n) => n.id)).toEqual(['a']);
    expect(patched.pages[1].items.map((n) => n.id)).toEqual(['c', 'd']);
  });

  it('leaves other pages and their nextCursor untouched', () => {
    const original = paginatedPages();
    const patched = removePatch(original, { id: 'a' });
    expect(patched.pages[0].nextCursor).toBe('cursor-1');
    expect(patched.pages[1].nextCursor).toBeNull();
  });

  it('does not mutate its input', () => {
    const original = paginatedPages();
    const snapshot = structuredClone(original);
    removePatch(original, { id: 'd' });
    expect(original).toEqual(snapshot);
  });
});

describe('movePatch', () => {
  it('drops the moved node out of the current folder listing, like a delete', () => {
    const original = paginatedPages();
    const patched = movePatch(original, { id: 'c', parentId: 'somewhere-else' });
    const remainingIds = patched.pages.flatMap((p) => p.items.map((n) => n.id));
    expect(remainingIds).toEqual(['a', 'b', 'd']);
  });
});

describe('rollback', () => {
  it('restores exactly the pre-mutation snapshot after a failed rename', () => {
    const previous = paginatedPages();
    const snapshotBeforeMutation = structuredClone(previous);
    renamePatch(previous, { id: 'a', name: 'Optimistic Name' });
    // onError in useNodeMutations sets the cache back to `previous` — since
    // the patch never mutated it, this is exactly what a real rollback
    // would restore.
    expect(previous).toEqual(snapshotBeforeMutation);
  });
});
