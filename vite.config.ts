import { defineConfig } from 'vitest/config';
import { buildStamp } from './src/headless/build';

export default defineConfig({
  define: { 'import.meta.env.VITE_BUILD': JSON.stringify(buildStamp()) },
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
    testTimeout: 60_000,
  },
});
