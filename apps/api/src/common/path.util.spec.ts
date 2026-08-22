import { buildPath, ancestorIds, isSelfOrDescendant, subtreePrefix } from './path.util';

describe('buildPath', () => {
  it('builds a root path from a null parent', () => {
    expect(buildPath(null, 'root')).toBe('/root/');
  });

  it('appends the id to the parent path', () => {
    expect(buildPath('/root/', 'kid')).toBe('/root/kid/');
  });
});

describe('ancestorIds', () => {
  it('returns ancestors excluding the node itself', () => {
    expect(ancestorIds('/root/mid/leaf/')).toEqual(['root', 'mid']);
  });

  it('returns an empty array for a root node', () => {
    expect(ancestorIds('/root/')).toEqual([]);
  });
});

describe('isSelfOrDescendant', () => {
  it('flags a node moving into itself', () => {
    expect(isSelfOrDescendant('/root/a/', '/root/a/')).toBe(true);
  });

  it('flags a node moving into its own child', () => {
    expect(isSelfOrDescendant('/root/a/b/', '/root/a/')).toBe(true);
  });

  it('allows a sibling destination', () => {
    expect(isSelfOrDescendant('/root/c/', '/root/a/')).toBe(false);
  });

  it('does not treat an id-prefix collision as descent', () => {
    expect(isSelfOrDescendant('/root/abc/', '/root/ab/')).toBe(false);
  });
});

describe('subtreePrefix', () => {
  it('returns the node path itself as the LIKE prefix', () => {
    expect(subtreePrefix('/root/a/')).toBe('/root/a/');
  });
});
