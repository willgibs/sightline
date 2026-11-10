/**
 * What the page does every frame, in a real browser on this machine's GPU.
 *
 * The simulation's ticks have `npm run hitches`. This is the other half: the page. It would
 * have caught the scope's overlay, a full-window canvas cleared and redrawn every frame
 * though nothing on it had changed, which no test and no profile of the simulation can see.
 *
 *   npm run frames                         the takedown from its overview
 *   npm run frames -- 'scene=live-camp&params=seed=DEG-0219%26perch=1'
 *
 * For each way of looking (idle, turning, walking, scoped, binoculars, the lab panel, the
 * debug view) it reports, per frame:
 * - the page's own work, ms (the game's own measure);
 * - what was written to the page: DOM changes by element, and 2D canvas calls by canvas,
 *   with how often a canvas was cleared whole. Anything written every frame that didn't
 *   change is the thing to look for.
 * Then the slowest frame after each change of view (scoping in, the debug view, a first
 * look the other way, a shot), first time and second; the frames after "begin"; and how
 * long a frame takes with the frame-rate limit off, which is what's left of 8 ms at 120 Hz.
 *
 * Chromium runs without a window but on the real GPU (Playwright's `chromium` channel,
 * Metal on a Mac). With no audio device and nobody at the keys it is still not a person's
 * browser: it says what the page does, and a sitting's telemetry (`npm run playtest`) says
 * what that cost on the day.
 */
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer } from 'vite';
import { buildStamp } from './build';

const query = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'scene=takedown&params=seed=LEB-2534%26perch=1';
const root = path.resolve(import.meta.dirname, '../..');
const GPU = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
const SIZE = { width: 1728, height: 1117 };

/** Counts what the page writes while `on`: installed before the game's own code runs. */
const CENSUS = `(() => {
  const C = (window.__census = { on: false, canvas: {}, frames: 0, dom: {} });
  const name = (el) => (!el || !el.tagName ? 'text' : el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/)[0] : ''));
  const where = (n) => { const el = n && n.nodeType === 1 ? n : n && n.parentElement; return el ? (el.parentElement ? name(el.parentElement) + ' > ' : '') + name(el) : 'text'; };
  const P = CanvasRenderingContext2D.prototype;
  for (const m of ['clearRect', 'fillRect', 'drawImage', 'fill', 'stroke', 'fillText', 'strokeText', 'putImageData']) {
    const orig = P[m];
    P[m] = function (...a) {
      if (C.on) {
        const c = this.canvas;
        const e = (C.canvas[name(c) + ' ' + c.width + '×' + c.height] ??= { calls: 0, whole: 0 });
        e.calls++;
        const ratio = window.devicePixelRatio || 1;
        if ((m === 'clearRect' || m === 'fillRect') && a[2] * ratio >= c.width * 0.9 && a[3] * ratio >= c.height * 0.9) e.whole++;
      }
      return orig.apply(this, a);
    };
  }
  window.__censusStart = () => {
    C.on = true; C.canvas = {}; C.dom = {}; C.frames = 0;
    if (!C.watching) {
      C.watching = true;
      new MutationObserver((list) => { if (!C.on) return; for (const r of list) { const k = where(r.target) + ' [' + (r.type === 'attributes' ? r.attributeName : r.type === 'childList' ? 'content' : 'text') + ']'; C.dom[k] = (C.dom[k] ?? 0) + 1; } }).observe(document.body, { subtree: true, attributes: true, childList: true, characterData: true });
      const loop = () => { if (C.on) C.frames++; requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
  };
  window.__censusStop = () => { C.on = false; return { frames: C.frames, dom: C.dom, canvas: C.canvas, cpu: window.sightline.state().perf.cpuMs }; };
  window.__frames = [];
  let prev = 0;
  const watch = (now) => { if (prev) window.__frames.push([now, now - prev]); prev = now; requestAnimationFrame(watch); };
  requestAnimationFrame(watch);
})()`;

interface Census {
  frames: number;
  dom: Record<string, number>;
  canvas: Record<string, { calls: number; whole: number }>;
  cpu: number;
}

async function open(browser: Browser, url: string): Promise<Page> {
  const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 2 });
  await page.route('**/__playtests/**', (route) => route.fulfill({ status: 204 }));
  await page.addInitScript(CENSUS);
  await page.goto(url);
  await page.waitForFunction(`(() => { try { return ['start', 'error'].includes(window.sightline.state().overlay); } catch { return false; } })()`, null, { timeout: 240_000, polling: 250 });
  return page;
}

/** One way of looking: what to do first, what to undo after, and what it's called. */
const MODES: ReadonlyArray<readonly [name: string, enter: string, leave: string]> = [
  ['idle', '0', '0'],
  ['turning', 'window.__turn = setInterval(() => window.sightline.look(((window.__h = (window.__h ?? 200) + 0.7)) % 360, -4), 16)', 'clearInterval(window.__turn)'],
  ['walking', `window.sightline.hold(['KeyW'])`, 'window.sightline.hold([])'],
  ['scoped', 'window.sightline.zoom(true)', 'window.sightline.zoom(false)'],
  ['binoculars', `window.sightline.hold(['KeyF'])`, 'window.sightline.hold([])'],
  ['debug view', 'window.sightline.debug(true)', 'window.sightline.debug(false)'],
];

const server = await createServer({
  root,
  configFile: false,
  logLevel: 'warn',
  cacheDir: path.join(root, 'node_modules/.vite-look'),
  define: { 'import.meta.env.VITE_BUILD': JSON.stringify(buildStamp()) },
  optimizeDeps: { include: ['three'] },
  server: { port: 5199, strictPort: false, hmr: false },
});
await server.listen();
const base = server.resolvedUrls?.local[0] ?? `http://localhost:${server.config.server.port}/`;
let browser: Browser | null = null;
try {
  browser = await chromium.launch({ channel: 'chromium', headless: true, args: GPU });
  const page = await open(browser, `${base}?${query}`);
  const gpu = await page.evaluate(`(() => { const g = document.createElement('canvas').getContext('webgl2'); const e = g && g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; })()`);
  console.log(`${query}\n${SIZE.width}×${SIZE.height} at ×2 · ${String(gpu)}\n`);

  // The frames after "begin": the first is the one a player sees the run start on.
  await page.evaluate(`(() => { window.__frames.length = 0; window.sightline.play(); })()`);
  await page.waitForTimeout(2500);
  const begin = (await page.evaluate(`window.__frames.slice(0, 6).map((f) => Math.round(f[1]))`)) as number[];
  console.log(`after "begin", the first frames took  ${begin.join(', ')} ms\n`);

  console.log('every frame, by way of looking:      page work   written to the page');
  for (const [name, enter, leave] of MODES) {
    await page.evaluate(enter);
    await page.waitForTimeout(2000);
    await page.evaluate('window.__censusStart()');
    await page.waitForTimeout(4000);
    const c = (await page.evaluate('window.__censusStop()')) as Census;
    await page.evaluate(leave);
    await page.waitForTimeout(500);
    const f = Math.max(1, c.frames);
    const dom = Object.entries(c.dom)
      .filter(([, n]) => n / f >= 0.2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, n]) => `${k} ×${(n / f).toFixed(1)}`);
    const canvas = Object.entries(c.canvas)
      .filter(([, v]) => v.calls / f >= 0.2)
      .sort((a, b) => b[1].calls - a[1].calls)
      .map(([k, v]) => `${k}: ${(v.calls / f).toFixed(v.calls / f < 10 ? 1 : 0)} calls${v.whole / f >= 0.2 ? `, cleared whole ×${(v.whole / f).toFixed(1)}` : ''}`);
    const written = [...canvas, ...dom];
    console.log(`  ${name.padEnd(34)} ${c.cpu.toFixed(2).padStart(5)} ms   ${written.length > 0 ? written.join(' · ') : 'nothing'}`);
  }

  // A change of view: the slowest frame in the second after it, the first time and the second.
  console.log('\nthe slowest frame after a change of view, first time and second:');
  const after = async (js: string): Promise<number> => {
    const t0 = (await page.evaluate('performance.now()')) as number;
    await page.evaluate(js);
    await page.waitForTimeout(900);
    return (await page.evaluate(`Math.round(Math.max(0, ...window.__frames.filter((f) => f[0] >= ${t0}).map((f) => f[1])))`)) as number;
  };
  const CHANGES: ReadonlyArray<readonly [string, string, string]> = [
    ['scope up', 'window.sightline.zoom(true)', 'window.sightline.zoom(false)'],
    ['binoculars up', `window.sightline.hold(['KeyF'])`, 'window.sightline.hold([])'],
    ['the debug view', 'window.sightline.debug(true)', 'window.sightline.debug(false)'],
    ['a look the other way', 'window.sightline.look(20, -3)', 'window.sightline.look(205, -3)'],
    ['going prone', `window.sightline.tap('KeyZ')`, `window.sightline.tap('KeyZ')`],
    ['a shot', 'window.sightline.click()', '0'],
  ];
  for (const [name, change, back] of CHANGES) {
    const first = await after(change);
    await after(back);
    await page.waitForTimeout(600);
    const second = await after(change);
    await after(back);
    console.log(`  ${name.padEnd(22)} ${String(first).padStart(4)} ms, then ${String(second).padStart(4)} ms`);
  }
  await browser.close();

  // With the limit off, frames come as fast as the page and the GPU can make them.
  browser = await chromium.launch({ channel: 'chromium', headless: true, args: [...GPU, '--disable-frame-rate-limit', '--disable-gpu-vsync'] });
  const free = await open(browser, `${base}?${query}`);
  await free.evaluate('window.sightline.play()');
  await free.waitForTimeout(4000);
  await free.evaluate('window.__frames.length = 0');
  await free.waitForTimeout(5000);
  const ms = (await free.evaluate(`(() => { const f = window.__frames.map((x) => x[1]).sort((a, b) => a - b); return [f.reduce((a, b) => a + b, 0) / f.length, f[Math.floor(0.95 * (f.length - 1))]]; })()`)) as [number, number];
  const pixels = (await free.evaluate(`(() => { const c = document.querySelector('canvas'); return c.width + '×' + c.height; })()`)) as string;
  console.log(`\nwith the frame-rate limit off, a frame takes ${ms[0].toFixed(1)} ms on average, 95% under ${ms[1].toFixed(1)} ms (the picture is ${pixels})`);
} finally {
  await browser?.close();
  await server.close();
}
