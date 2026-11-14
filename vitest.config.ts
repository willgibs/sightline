import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';
import { TimedSequencer } from './tests/sequencer';

/**
 * The tests that run in Node (`npm test`, CI's shards). The game's own build and dev
 * server read vite.config.ts alone, so they never load the test runner; the browser tests
 * have their own config (vitest.browser.config.ts).
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['tests/**/*.test.ts'],
      // Browser tests need a real browser: npm run test:browser.
      exclude: ['tests/browser/**', 'node_modules/**'],
      environment: 'node',
      // Windows' runner is the slowest, and the heaviest tests (a sitting generated headless) pass 60 s there.
      testTimeout: 180_000,
      // A beforeAll may generate worlds, and a generated camp takes seconds on a busy runner.
      hookTimeout: 180_000,
      // CI's shards are dealt by how long each file takes (tests/sequencer.ts), not by name.
      sequence: { sequencer: TimedSequencer },
    },
  }),
);
