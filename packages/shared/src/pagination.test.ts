import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor } from './pagination';

describe('cursor', () => {
  it('round-trips a keyset position', () => {
    const c = { type: 'FILE' as const, name: 'Report (2).pdf', id: 'abc-123' };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it('survives names with unicode and slashes', () => {
    const c = { type: 'FOLDER' as const, name: 'Q3 / Фінанси 📊', id: 'x' };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it('returns null for malformed input instead of throwing', () => {
    expect(decodeCursor('not-base64!!')).toBeNull();
  });
});
