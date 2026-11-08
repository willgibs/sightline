import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { buildStamp } from './build';

/**
 * The game in a headless browser, for scripts that look at it or drive it (Node only).
 * `openGame()` starts a dev server of its own, opens the game in Chromium and waits until
 * the valley or scene is ready; `run()` then evaluates expressions in the page with the
 * automation hooks in scope as `sightline` (their list is `automation()` in
 * src/app/game.ts). `npm run look` (headless/look.ts) is built on it.
 *
 * What a headless browser can't tell you, and what this does about it:
 * - It draws with a software GPU at a few frames a second, so frame rate, rhythm and feel
 *   are judged by model tests or on a real machine, never from here.
 * - Esc doesn't release the pointer lock: `sightline.pause()` pauses.
 * - The server has no hot reload, so editing src while a script runs doesn't reload the
 *   page under it (the script sees the code it started with).
 * - three is bundled before the page loads: a dependency first met mid-load would make
 *   Vite reload the page.
 * - Saves to the dev server's playtest inbox are answered and dropped, so scripted runs
 *   never land in playtests/.
 */

export interface GameOptions {
  /** The URL's query, without the '?': 'scene=movement-course', 'seed=MUD-2210&view=debug'. */
  query?: string;
  width?: number;
  height?: number;
  /** The screenshots' device pixel ratio: 1 for pictures only you check, 2 for people. */
  scale?: number;
  /** How long the valley or scene may take to be ready. */
  timeoutMs?: number;
}

export interface OpenGame {
  readonly page: Page;
  /** The page's address, query included. */
  readonly url: string;
  /** Errors the page has thrown or logged so far. */
  readonly errors: string[];
  /** Evaluates an expression in the page with the hooks as `sightline`: `run('sightline.state().tick')`. */
  run<T = unknown>(expression: string): Promise<T>;
  /** Resolves once the expression is true; throws after `timeoutMs`. */
  until(expression: string, timeoutMs?: number): Promise<void>;
  /** Closes the browser and the server. */
  close(): Promise<void>;
}

/**
 * An expression with the hooks in scope as `sightline`. Scripts pass strings, not
 * functions: tsx can wrap a function in helpers that don't exist in the page.
 */
const withHooks = (expression: string): string => `(() => { const sightline = window.sightline; return (${expression}); })()`;

export async function openGame(opts: GameOptions = {}): Promise<OpenGame> {
  const root = path.resolve(import.meta.dirname, '../..');
  let server: ViteDevServer | null = null;
  let browser: Browser | null = null;
  const close = async (): Promise<void> => {
    await browser?.close();
    await server?.close();
  };
  try {
    server = await createServer({
      root,
      configFile: false,
      logLevel: 'warn',
      // Its own cache, so a dev server running beside it keeps its own.
      cacheDir: path.join(root, 'node_modules/.vite-look'),
      define: { 'import.meta.env.VITE_BUILD': JSON.stringify(buildStamp()) },
      optimizeDeps: { include: ['three'] },
      server: { port: 5199, strictPort: false, hmr: false },
    });
    await server.listen();
    const base = server.resolvedUrls?.local[0] ?? `http://localhost:${server.config.server.port}/`;
    const url = opts.query ? `${base}?${opts.query}` : base;

    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: opts.width ?? 1280, height: opts.height ?? 720 }, deviceScaleFactor: opts.scale ?? 1 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.route('**/__playtests/**', (route) => route.fulfill({ status: 204 }));

    const run = async <T>(expression: string): Promise<T> => (await page.evaluate(withHooks(expression))) as T;
    const until = async (expression: string, timeoutMs = 60_000): Promise<void> => {
      // A predicate that throws (the hooks not there yet) counts as not yet.
      const predicate = `(() => { try { const sightline = window.sightline; return !!sightline && !!(${expression}); } catch { return false; } })()`;
      await page.waitForFunction(predicate, null, { timeout: timeoutMs, polling: 250 });
    };

    await page.goto(url);
    await until(`['start', 'error'].includes(sightline.state().overlay)`, opts.timeoutMs ?? 240_000);
    if ((await run<string>('sightline.state().overlay')) === 'error') {
      const why = await run<string>(`[document.querySelector('.overlay-title')?.textContent, document.querySelector('.report')?.textContent].filter(Boolean).join(': ')`);
      throw new Error(`The game didn't start at ${url}: ${why || 'see the page'}`);
    }
    return { page, url, errors, run, until, close };
  } catch (e) {
    await close();
    throw e;
  }
}
