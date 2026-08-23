import { describe, it, expect } from 'vitest';
import { isInvalidMoveDestination, moveDestinationDisabledReason } from './move-tree';

const opts = { movingNodeId: 'moving', currentParentId: 'current-parent' };

describe('isInvalidMoveDestination', () => {
  it('allows an unrelated folder', () => {
    expect(isInvalidMoveDestination(['root', 'unrelated'], opts)).toBe(false);
  });

  it('disallows the node being moved itself', () => {
    expect(isInvalidMoveDestination(['root', 'moving'], opts)).toBe(true);
  });

  it('disallows a descendant of the node being moved', () => {
    expect(isInvalidMoveDestination(['root', 'moving', 'child', 'grandchild'], opts)).toBe(true);
  });

  it('disallows the current parent (already there)', () => {
    expect(isInvalidMoveDestination(['root', 'current-parent'], opts)).toBe(true);
  });

  it('allows the root when nothing else disqualifies it', () => {
    expect(isInvalidMoveDestination(['root'], opts)).toBe(false);
  });

  it('treats an empty path as valid (no candidate yet)', () => {
    expect(isInvalidMoveDestination([], opts)).toBe(false);
  });
});

describe('moveDestinationDisabledReason', () => {
  it('returns null for a valid destination', () => {
    expect(moveDestinationDisabledReason(['root', 'unrelated'], opts)).toBeNull();
  });

  it('explains why the moving node itself is disabled', () => {
    expect(moveDestinationDisabledReason(['root', 'moving'], opts)).toMatch(/cannot|can't/i);
  });

  it('explains why a descendant is disabled, distinctly from self', () => {
    const self = moveDestinationDisabledReason(['root', 'moving'], opts);
    const descendant = moveDestinationDisabledReason(['root', 'moving', 'child'], opts);
    expect(descendant).not.toBeNull();
    expect(descendant).not.toEqual(self);
  });

  it('explains why the current parent is disabled', () => {
    expect(moveDestinationDisabledReason(['root', 'current-parent'], opts)).toMatch(/already/i);
  });
});
