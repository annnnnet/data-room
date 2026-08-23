#!/usr/bin/env node
/**
 * Builds the API and shared package for real, boots the actual built
 * artifact (`node dist/src/main.js`) as a plain Node process — not Jest,
 * not ts-node — and asserts it serves a real request correctly, then
 * shuts it down.
 *
 * Why this exists: `packages/shared` used to ship raw TypeScript, which
 * meant the API could not boot at all under plain Node — while every Jest
 * test still passed, because Jest transpiles `@data-room/shared` from
 * source instead of resolving its built `dist` the way production does.
 * That specific bug is fixed, but nothing else in the test suite exercises
 * the built artifact: Jest maps `@data-room/shared` to source for every
 * unit and e2e test, so a stale or broken `dist` (for either package)
 * would still be invisible to all 300 passing tests and would only ever
 * surface at deploy. This script is that missing check.
 *
 * Usage: `pnpm --filter @data-room/api test:dist-boot` (from anywhere), or
 * `node scripts/dist-boot-check.js` from `apps/api`. Exits non-zero and
 * prints a clear reason on any failure — build failure, the process never
 * coming up, a wrong status code, or an unexpected response body.
 */
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');

const API_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(API_DIR, '../..');
// A port the real dev API (4000) is unlikely to be using, so this can run
// alongside a live `pnpm dev` session without colliding.
const PORT = process.env.DIST_BOOT_CHECK_PORT ?? '4999';

function log(msg) {
  console.log(`[dist-boot-check] ${msg}`);
}

function fail(msg) {
  console.error(`[dist-boot-check] FAIL: ${msg}`);
  process.exit(1);
}

function run(cmd, args, opts) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: true, ...opts });
  if (res.status !== 0) {
    fail(`command failed (${res.status}): ${cmd} ${args.join(' ')}`);
  }
}

function get(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: pathname, timeout: 3000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('request timed out')));
  });
}

async function waitForServer(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      return await get(port, '/api/data-rooms');
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`server never came up on port ${port}: ${lastErr?.message ?? 'unknown error'}`);
}

async function main() {
  log('building @data-room/shared and @data-room/api...');
  run('pnpm', ['--filter', '@data-room/shared', 'build'], { cwd: REPO_ROOT });
  run('pnpm', ['--filter', '@data-room/api', 'exec', 'nest', 'build'], { cwd: API_DIR });

  const distEntry = path.join(API_DIR, 'dist', 'src', 'main.js');
  const fs = require('node:fs');
  if (!fs.existsSync(distEntry)) {
    fail(`expected build output at ${distEntry} but it does not exist`);
  }

  log(`booting node ${path.relative(API_DIR, distEntry)} on port ${PORT}...`);
  const child = spawn('node', [distEntry], {
    cwd: API_DIR,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (c) => (stdout += c));
  child.stderr.on('data', (c) => (stderr += c));

  let exitedEarly = false;
  child.on('exit', (code, signal) => {
    if (!child.__expectedExit) {
      exitedEarly = true;
      console.error(`[dist-boot-check] process exited early (code=${code}, signal=${signal})`);
      console.error('--- stdout ---\n' + stdout);
      console.error('--- stderr ---\n' + stderr);
    }
  });

  try {
    const res = await waitForServer(PORT, 20_000);
    if (exitedEarly) fail('server process exited before responding');

    if (res.status !== 401) {
      fail(
        `expected GET /api/data-rooms to return 401, got ${res.status}. Body: ${res.body}\n` +
          '--- stdout ---\n' + stdout + '\n--- stderr ---\n' + stderr,
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(res.body);
    } catch {
      fail(`response body was not valid JSON: ${res.body}`);
    }
    if (parsed.code !== 'UNAUTHORIZED') {
      fail(`expected body.code === 'UNAUTHORIZED', got: ${res.body}`);
    }

    log(`OK: booted dist/src/main.js under plain Node and got 401 UNAUTHORIZED as expected.`);
  } finally {
    child.__expectedExit = true;
    child.kill();
  }
}

main().catch((err) => {
  fail(err.stack || String(err));
});
