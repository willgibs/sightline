import { defineConfig } from 'vite';
import { buildStamp } from './src/headless/build';
import { playtestInbox } from './src/headless/playtestInbox';

// The tests' settings are in vitest.config.ts, which builds on this.
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
});
