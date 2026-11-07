import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/**
 * Tests that need a real browser: Web Audio, WebGL, and the simulation running inside
 * each browser's own JavaScript engine. `npm run test:browser` runs them in Chromium;
 * CI sets BROWSERS=chromium,firefox,webkit to run them in all three engines.
 */
const browsers = (process.env.BROWSERS ?? 'chromium').split(',').map((b) => b.trim()) as ('chromium' | 'firefox' | 'webkit')[];

export default defineConfig({
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
