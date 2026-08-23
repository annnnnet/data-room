/**
 * Escapes `%`, `_`, and the escape character itself in a term destined for
 * a Postgres `LIKE`/`ILIKE` pattern. Prisma's `contains`/`startsWith`/
 * `endsWith` do NOT escape these — they interpolate the raw string between
 * `%` wildcards — so an unescaped user-supplied term lets `%` and `_` act
 * as wildcards instead of literal characters. `?q=%` would then compile to
 * `ILIKE '%%%'`, matching (and returning) every row in the caller's scope;
 * a search for a filename that genuinely contains `%` or `_` (e.g.
 * `50%_off.pdf`) would silently over-match instead of finding it by name.
 *
 * Postgres's default LIKE escape character is backslash, and Prisma issues
 * no explicit `ESCAPE` clause (confirmed via query logging), so escaping
 * with backslash here is exactly what the emitted `ILIKE $1` expects.
 */
export function escapeLikeTerm(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
