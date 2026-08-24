import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: false,
    // The Playwright smoke test lives under e2e/ with its own runner
    // (playwright.config.ts) — vitest's default include picks up *.spec.ts
    // anywhere, so exclude that directory explicitly or it tries (and
    // fails) to run Playwright's test() inside vitest.
    exclude: ['e2e/**', 'node_modules/**'],
    // lib/api.ts refuses to load without this, so a misconfigured deploy
    // fails loudly instead of silently issuing requests to `undefined/api/...`.
    // Tests that import it for real (rather than mocking the module) need a
    // value here — the host is never contacted; fetch is stubbed.
    env: { NEXT_PUBLIC_API_URL: 'http://localhost:4000' },
  },
});
