-- The previous `node_name_trgm` index was `GIN (lower("name") gin_trgm_ops)`
-- — a functional-expression index that only serves a predicate written as
-- `lower("name") LIKE lower($1)`. Prisma's `contains` with
-- `mode: 'insensitive'` compiles to `"name" ILIKE $1`, not that form, and
-- Postgres does not rewrite ILIKE into the lower() shape to match it. The
-- planner therefore could not use this index for filename search at all —
-- confirmed via EXPLAIN (ANALYZE, BUFFERS) against ~60k rows, which showed
-- a plain Seq Scan on "Node".
--
-- pg_trgm's `gin_trgm_ops` operator class registers support for the `~~*`
-- (ILIKE) operator directly, but only against an index on the raw column —
-- so replace the expression index with one on "name" itself.
DROP INDEX "node_name_trgm";
CREATE INDEX "node_name_trgm" ON "Node" USING GIN ("name" gin_trgm_ops);
