#!/usr/bin/env node
/**
 * Verifies that the local e2e test database actually has the schema pieces
 * that plain `prisma migrate deploy` success doesn't guarantee were kept:
 * the pg_trgm extension and the two raw-SQL indexes from the init
 * migration. A database silently missing the partial unique index would
 * make name-conflict tests pass vacuously.
 */
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv(path.resolve(__dirname, '../.env'));

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) {
  console.error('DATABASE_URL_TEST is not set in apps/api/.env — cannot verify.');
  process.exit(1);
}

process.env.DATABASE_URL = testUrl;
process.env.DIRECT_URL = process.env.DIRECT_URL_TEST || testUrl;

async function main() {
  const prisma = new PrismaClient();
  try {
    const ext = await prisma.$queryRawUnsafe(
      `SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'`,
    );
    const indexes = await prisma.$queryRawUnsafe(
      `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'Node' AND indexname IN ('node_parent_name_unique', 'node_name_trgm')`,
    );

    const hasExt = Array.isArray(ext) && ext.length === 1;
    const foundIndexNames = Array.isArray(indexes) ? indexes.map((r) => r.indexname) : [];
    const hasParentNameUnique = foundIndexNames.includes('node_parent_name_unique');
    const hasNameTrgm = foundIndexNames.includes('node_name_trgm');

    console.log('pg_trgm extension present:', hasExt);
    console.log('node_parent_name_unique present:', hasParentNameUnique);
    console.log('node_name_trgm present:', hasNameTrgm);
    if (Array.isArray(indexes)) {
      for (const row of indexes) {
        console.log('  -', row.indexname, ':', row.indexdef);
      }
    }

    if (!hasExt || !hasParentNameUnique || !hasNameTrgm) {
      console.error('Test database is missing required schema pieces.');
      process.exitCode = 1;
    } else {
      console.log('Test database schema verified OK.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
