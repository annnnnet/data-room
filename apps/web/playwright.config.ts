import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke-test config for the real dev servers (web on :3000, API on :4000).
 * This intentionally does NOT start the servers itself — `pnpm dev` (or an
 * already-running dev session) is expected to be up, same as a human
 * clicking around the app. `webServer` is left unset so the test never
 * silently boots a second copy of Next on a random port.
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
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
