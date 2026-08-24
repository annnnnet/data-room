import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke-test config for the real dev servers (web on :3000, API on :4000).
 *
 * `webServer` uses `reuseExistingServer`, so an already-running `pnpm dev`
 * session is reused as-is and nothing duplicate is booted; on a fresh clone
 * with nothing running, Playwright starts both itself. Without this, the
 * only symptom of "you forgot to start the servers" is a bare
 * ERR_CONNECTION_REFUSED, which is a poor first run for anyone reviewing
 * this repo.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.E2E_WEB_URL ?? 'http://localhost:3000',
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  // Against a deployed URL there is nothing to boot — starting local servers
  // would also mean the test silently exercised localhost instead of
  // production, which is the one thing a deployment check must not do.
  webServer: process.env.E2E_WEB_URL
    ? undefined
    : [
    {
      command: 'pnpm --filter @data-room/api start:dev',
      cwd: '../..',
      url: 'http://localhost:4000/api/data-rooms',
      // The API answers 401 unauthenticated — that still proves it is up.
      ignoreHTTPSErrors: true,
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'pnpm dev',
      url: 'http://localhost:3000/login',
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
