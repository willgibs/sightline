import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/**
 * Tests that need a real browser: Web Audio, WebGL, and the simulation running inside
 * each browser's own JavaScript engine. `npm run test:browser` runs them in Chromium;
 * CI sets BROWSERS=chromium,firefox,webkit to run them in all three engines.
 */
const browsers = (process.env.BROWSERS ?? 'chromium').split(',').map((b) => b.trim()) as ('chromium' | 'firefox' | 'webkit')[];

export default defineConfig({
  optimizeDeps: {
    // Bundled before the browser starts. With a bundle already cached, Vite doesn't look for
    // new dependencies at startup: one first met mid-run makes it re-bundle and reload the
    // page under the running tests. That was the first run after a change that sometimes
    // hung, and the rerun that passed. three is the game's only runtime dependency; a new
    // one joins this list.
    include: ['three'],
  },
  test: {
    include: ['tests/browser/**/*.test.ts'],
    testTimeout: 120_000,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: browsers.map((browser) => ({ browser })),
    },
  },
});
