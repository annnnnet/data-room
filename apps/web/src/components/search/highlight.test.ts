import { describe, it, expect } from 'vitest';
import { splitHighlight } from './highlight';

describe('splitHighlight', () => {
  it('returns the whole string unmatched when the term is empty', () => {
    expect(splitHighlight('MSA.pdf', '')).toEqual([{ text: 'MSA.pdf', match: false }]);
  });

  it('splits a single case-insensitive match out of the middle of the name', () => {
    expect(splitHighlight('Acme MSA Final.pdf', 'msa')).toEqual([
      { text: 'Acme ', match: false },
      { text: 'MSA', match: true },
      { text: ' Final.pdf', match: false },
    ]);
  });

  it('highlights every non-overlapping occurrence', () => {
    expect(splitHighlight('aa-aa-aa', 'aa')).toEqual([
      { text: 'aa', match: true },
      { text: '-', match: false },
      { text: 'aa', match: true },
      { text: '-', match: false },
      { text: 'aa', match: true },
    ]);
  });

  it('returns no match when the term is not present', () => {
    expect(splitHighlight('Contract.pdf', 'zzz')).toEqual([{ text: 'Contract.pdf', match: false }]);
  });

  // The server escapes `%`/`_` before hitting Postgres LIKE so a literal
  // `%` in the query term matches a literal `%` in a filename, never acts
  // as a wildcard. The highlighter has to treat the term literally too —
  // it must never build a regex out of it, or `%`/`_`/other metacharacters
  // would change what "matches" instead of being matched as plain text.
  it('treats a literal "%" in the term as plain text, not a LIKE wildcard', () => {
    expect(splitHighlight('50%_off.pdf', '%')).toEqual([
      { text: '50', match: false },
      { text: '%', match: true },
      { text: '_off.pdf', match: false },
    ]);
  });

  it('treats regex metacharacters in the term as plain text, not a regex', () => {
    // A regex-based highlighter without escaping would throw on unbalanced
    // parens/brackets, or silently match something the term didn't
    // literally contain. Plain indexOf can't do either.
    expect(() => splitHighlight('Report (v1).pdf', '(v1)')).not.toThrow();
    expect(splitHighlight('Report (v1).pdf', '(v1)')).toEqual([
      { text: 'Report ', match: false },
      { text: '(v1)', match: true },
      { text: '.pdf', match: false },
    ]);

    expect(() => splitHighlight('a.*b.pdf', '.*')).not.toThrow();
    expect(splitHighlight('a.*b.pdf', '.*')).toEqual([
      { text: 'a', match: false },
      { text: '.*', match: true },
      { text: 'b.pdf', match: false },
    ]);
  });
});
