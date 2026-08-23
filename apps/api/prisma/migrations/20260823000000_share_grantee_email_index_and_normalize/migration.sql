-- Share.granteeEmail had no index, so both `create` (owner invites by email,
-- looked up via User.email — see below) and reconciliation
-- (`updateMany({ where: { granteeEmail, granteeUserId: null } })`, run from
-- UserService.upsertFromClaims) forced a sequential scan of Share on every
-- lookup/write. Index it.
CREATE INDEX "Share_granteeEmail_idx" ON "Share" ("granteeEmail");

-- Email matching was case-sensitive at both ends: an invite to "A@b.com"
-- never reconciled against a user who signed up as "a@b.com", silently and
-- with no error anywhere. The application now normalises every email to
-- lowercase on write (invite path, claims upsert), so existing rows need the
-- same normalisation or they'd keep failing to match going forward. The
-- database holds only demo data, so a straightforward backfill is safe here;
-- a production migration would need to first resolve any rows that collide
-- once lowercased.
UPDATE "User" SET "email" = lower("email");
UPDATE "Share" SET "granteeEmail" = lower("granteeEmail") WHERE "granteeEmail" IS NOT NULL;
