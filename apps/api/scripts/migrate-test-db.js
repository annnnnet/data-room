#!/usr/bin/env node
/**
 * Applies pending Prisma migrations to the local e2e test database
 * (DATABASE_URL_TEST / DIRECT_URL_TEST in apps/api/.env), never to
 * DATABASE_URL (Supabase).
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

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
  console.error(
    'DATABASE_URL_TEST is not set in apps/api/.env — refusing to run ' +
      'migrations (would silently fall back to DATABASE_URL / Supabase).',
  );
  process.exit(1);
}

const env = {
  ...process.env,
  DATABASE_URL: testUrl,
  DIRECT_URL: process.env.DIRECT_URL_TEST || testUrl,
};

console.log('Applying migrations to the local e2e test database (DATABASE_URL_TEST)...');

const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: path.resolve(__dirname, '..'),
  env,
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status ?? 1);
