import { describe, it, expect } from 'vitest';
import { buildBreadcrumbLayout, type Crumb } from './breadcrumb-utils';

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
