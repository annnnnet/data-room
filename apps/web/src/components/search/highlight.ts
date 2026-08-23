/**
 * Splits `text` into highlight/non-highlight segments around every
 * occurrence of `term`, matched the same way the API matches it: a plain
 * case-insensitive substring, never a regex. Building this with a regex
 * (even an "escaped" one) is the classic way to reintroduce the exact
 * injection-shaped bug the API's `escapeLikeTerm` exists to close — a stray
 * `%`/`_`/regex metacharacter in the term would either break the pattern or
 * quietly change what it matches. Plain `indexOf` has no metacharacters to
 * worry about at all.
 */
export function splitHighlight(text: string, term: string): { text: string; match: boolean }[] {
  if (!term) return [{ text, match: false }];

  const lowerText = text.toLowerCase();
  const lowerTerm = term.toLowerCase();
  const parts: { text: string; match: boolean }[] = [];

  let i = 0;
  while (i < text.length) {
    const idx = lowerText.indexOf(lowerTerm, i);
    if (idx === -1) {
      parts.push({ text: text.slice(i), match: false });
      break;
    }
    if (idx > i) parts.push({ text: text.slice(i, idx), match: false });
    parts.push({ text: text.slice(idx, idx + term.length), match: true });
    i = idx + term.length;
  }

  return parts;
}
