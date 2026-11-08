import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

/**
 * The dev server's playtest inbox. The game in development sends each run's recording and
 * telemetry report here as it goes (src/app/playtest.ts), and they land in playtests/,
 * where `npm run playtest` reads them. Development only: the deployed game keeps its runs
 * in the browser instead.
 *
 *   PUT /__playtests/<name>.slrec   a recording
 *   PUT /__playtests/<name>.json    its telemetry report
 */

/** A session's files are named by the game: letters, digits, dots, dashes and underscores. */
export const PLAYTEST_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(slrec|json)$/;
const MAX_BYTES = 256 * 1024 * 1024;

export function playtestInbox(root: string): Plugin {
  const dir = join(root, 'playtests');
  return {
    name: 'sightline-playtest-inbox',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__playtests', (req, res) => {
        const name = decodeURIComponent((req.url ?? '').replace(/^\/+/, '').split('?')[0]!);
        if (req.method !== 'PUT') {
          res.statusCode = 405;
          res.end();
          return;
        }
        if (!PLAYTEST_NAME.test(name) || name.includes('..')) {
          res.statusCode = 400;
          res.end('A playtest file name is letters, digits, dots, dashes and underscores, ending .slrec or .json');
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        let refused = false;
        req.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES && !refused) {
            refused = true;
            res.statusCode = 413;
            res.end();
            req.destroy();
          }
          if (!refused) chunks.push(chunk);
        });
        req.on('end', () => {
          if (refused) return;
          try {
            mkdirSync(dir, { recursive: true });
            // Written whole, then renamed, so nothing ever reads half a file.
            const tmp = join(dir, `.${name}.part`);
            writeFileSync(tmp, Buffer.concat(chunks));
            renameSync(tmp, join(dir, name));
            res.statusCode = 204;
            res.end();
          } catch (e) {
            res.statusCode = 500;
            res.end(String(e));
          }
        });
      });
    },
  };
}
