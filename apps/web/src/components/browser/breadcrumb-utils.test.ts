import { describe, it, expect } from 'vitest';
import { buildBreadcrumbLayout, trimBreadcrumbsToRoot, type Crumb } from './breadcrumb-utils';

const crumb = (id: string): Crumb => ({ id, name: `Folder ${id}` });

describe('buildBreadcrumbLayout', () => {
  it('returns nothing for an empty chain', () => {
    expect(buildBreadcrumbLayout([])).toEqual({
      first: null,
      middle: [],
      visible: [],
      current: null,
      collapsed: false,
    });
  });

  it('treats the sole crumb as both first-less and current when there is only one', () => {
    const layout = buildBreadcrumbLayout([crumb('a')]);
    expect(layout.current).toEqual(crumb('a'));
    expect(layout.first).toBeNull();
    expect(layout.collapsed).toBe(false);
  });

  it('under the collapse threshold, shows every ancestor inline and nothing in the overflow menu', () => {
    const chain = [crumb('a'), crumb('b'), crumb('c')];
    const layout = buildBreadcrumbLayout(chain);
    expect(layout.collapsed).toBe(false);
    expect(layout.first).toEqual(crumb('a'));
    expect(layout.visible).toEqual([crumb('b')]);
    expect(layout.middle).toEqual([]);
    expect(layout.current).toEqual(crumb('c'));
  });

  it('over the collapse threshold, moves the middle ancestors into the overflow menu', () => {
    const chain = [crumb('a'), crumb('b'), crumb('c'), crumb('d'), crumb('e')];
    const layout = buildBreadcrumbLayout(chain);
    expect(layout.collapsed).toBe(true);
    expect(layout.first).toEqual(crumb('a'));
    expect(layout.visible).toEqual([]);
    expect(layout.current).toEqual(crumb('e'));
  });

  it('retains every collapsed ancestor in the overflow menu — none are dropped', () => {
    const chain = [crumb('a'), crumb('b'), crumb('c'), crumb('d'), crumb('e'), crumb('f')];
    const layout = buildBreadcrumbLayout(chain);
    expect(layout.middle).toEqual([crumb('b'), crumb('c'), crumb('d'), crumb('e')]);
  });

  it('never includes the current crumb among the link-rendered groups (first/middle/visible) — only `current` carries it, and callers render that as non-link text', () => {
    const chain = [crumb('a'), crumb('b'), crumb('c'), crumb('d'), crumb('e')];
    const layout = buildBreadcrumbLayout(chain);
    const linkedIds = [layout.first, ...layout.middle, ...layout.visible]
      .filter((c): c is Crumb => c !== null)
      .map((c) => c.id);
    expect(linkedIds).not.toContain(layout.current?.id);
  });

  it('respects a custom threshold', () => {
    const chain = [crumb('a'), crumb('b'), crumb('c')];
    expect(buildBreadcrumbLayout(chain, 2).collapsed).toBe(true);
    expect(buildBreadcrumbLayout(chain, 3).collapsed).toBe(false);
  });
});

describe('trimBreadcrumbsToRoot', () => {
  it('cuts everything above the root when the root is mid-chain', () => {
    const chain = [crumb('room'), crumb('acme'), crumb('legal'), crumb('contracts')];
    expect(trimBreadcrumbsToRoot(chain, 'legal')).toEqual([crumb('legal'), crumb('contracts')]);
  });

  it('is a no-op when the root is already the head of the chain', () => {
    const chain = [crumb('legal'), crumb('contracts')];
    expect(trimBreadcrumbsToRoot(chain, 'legal')).toEqual(chain);
  });

  it('is a no-op when the root is the sole (current) crumb', () => {
    const chain = [crumb('contracts')];
    expect(trimBreadcrumbsToRoot(chain, 'contracts')).toEqual(chain);
  });

  it('fails closed to just the current crumb when the root is absent from the chain', () => {
    // This must never happen given a correct API — the access check is
    // supposed to guarantee the root is always in the chain — but the trim
    // exists specifically to defend against exactly this "should never
    // happen" case, so it must not hand back the untrimmed chain here.
    const chain = [crumb('room'), crumb('acme'), crumb('legal'), crumb('contracts')];
    const trimmed = trimBreadcrumbsToRoot(chain, 'not-in-chain');
    expect(trimmed).toEqual([crumb('contracts')]);
    // In particular, the ancestors above the (missing) share root must never
    // leak through.
    expect(trimmed.map((c) => c.id)).not.toContain('room');
    expect(trimmed.map((c) => c.id)).not.toContain('acme');
  });

  it('fails closed to an empty array when the root is absent and the chain itself is empty', () => {
    expect(trimBreadcrumbsToRoot([], 'not-in-chain')).toEqual([]);
  });
});
