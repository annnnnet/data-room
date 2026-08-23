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
  },
});
