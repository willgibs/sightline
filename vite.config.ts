import { defineConfig } from 'vitest/config';
import { buildStamp } from './src/headless/build';
import { playtestInbox } from './src/headless/playtestInbox';

export default defineConfig({
  define: { 'import.meta.env.VITE_BUILD': JSON.stringify(buildStamp()) },
  // Development only: runs played in the dev server are kept in playtests/ (src/app/playtest.ts).
  plugins: [playtestInbox(import.meta.dirname)],
  server: { port: 5173 },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // Browser tests need a real browser: npm run test:browser.
    exclude: ['tests/browser/**', 'node_modules/**'],
    environment: 'node',
    // Windows' runner is the slowest, and the heaviest tests (a sitting generated headless) pass 60 s there.
    testTimeout: 180_000,
    // A beforeAll may generate worlds, and a generated camp takes seconds on a busy runner.
    hookTimeout: 180_000,
  },
});
