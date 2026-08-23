import { describe, it, expect } from 'vitest';
import { ancestorCandidates } from './ancestor-walk';

describe('ancestorCandidates', () => {
  it('excludes the current node and orders nearest-ancestor first', () => {
    const breadcrumbs = [
      { id: 'root', name: 'Room' },
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'gone', name: 'Gone' },
    ];
    expect(ancestorCandidates(breadcrumbs)).toEqual(['b', 'a', 'root']);
  });

  it('returns an empty list when there are no ancestors', () => {
    expect(ancestorCandidates([{ id: 'gone', name: 'Gone' }])).toEqual([]);
  });
});
