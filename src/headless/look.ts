/**
 * Pictures of the game as a player would see it (CLAUDE.md: "Look at the result"): the
 * honest view and the debug view, from a headless browser (headless/browser.ts).
 *
 *   npm run look                                  the default valley, where a run starts
 *   npm run look -- --seed MUD-2210               another valley
 *   npm run look -- --scene movement-course       a scene
 *   npm run look -- --look 90,-6                  the body turned to a heading and pitch, in degrees
 *   npm run look -- --walk 3                      after 3 s of play walking forward
 *   npm run look -- --fly -20,28,26,160,-38       the debug view from the fly camera: x, y, z, heading, pitch
 *   npm run look -- --query 'spawn=edge&dpr=0.5'  anything else the URL takes
 *   npm run look -- --views honest --size 1280x720 --scale 2 --wait 2000 --out shots
 *
 * The pictures go to shots/ (not committed), named after the valley or scene. It prints
 * what it saw (the camera, the tick, any page errors) and fails if the page logged an error.
 * For more than pictures, a script can drive the game itself with `openGame()`.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { defaultTuning } from '../config/tuning';
import { parseArgs } from './args';
import { openGame } from './browser';

const args = parseArgs(process.argv.slice(2));

function fail(why: string): never {
  console.error(why);
  process.exit(2);
}

function numbers(name: string, count: number, example: string): number[] | null {
  const v = args.get(name);
  if (v === undefined) return null;
  const xs = v.split(',').map(Number);
  if (xs.length !== count || !xs.every(Number.isFinite)) fail(`--${name} takes ${count} numbers separated by commas, such as ${example}; got '${v}'`);
  return xs;
}

const query = new URLSearchParams(args.get('query') ?? '');
for (const key of ['seed', 'scene']) {
  const v = args.get(key);
  if (v !== undefined) query.set(key, v);
}
const [width = 0, height = 0] = (args.get('size') ?? '1280x720').split('x').map(Number);
if (!(width > 0 && height > 0)) fail(`--size takes a width and height such as 1280x720; got '${args.get('size')}'`);
const scale = Number(args.get('scale') ?? 1);
if (!(scale > 0 && scale <= 3)) fail(`--scale takes a pixel ratio from 0 to 3; got '${args.get('scale')}'`);
const waitMs = Number(args.get('wait') ?? 1500);
if (!(waitMs >= 0)) fail(`--wait takes milliseconds; got '${args.get('wait')}'`);
const views = (args.get('views') ?? 'honest,debug').split(',');
if (!views.every((v) => v === 'honest' || v === 'debug')) fail(`--views takes honest, debug or both; got '${args.get('views')}'`);
const walk = Number(args.get('walk') ?? 0);
if (!(walk >= 0)) fail(`--walk takes seconds of play; got '${args.get('walk')}'`);
const lookAt = numbers('look', 2, '90,-6');
const fly = numbers('fly', 5, '-20,28,26,160,-38');
if (fly && !views.includes('debug')) fail(`--fly moves the debug view's camera, and the honest view is always from the body: add debug to --views`);
const out = path.resolve(args.get('out') ?? 'shots');

const t0 = performance.now();
const game = await openGame({ query: query.toString(), width, height, scale }).catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
try {
  const loadedMs = Math.round(performance.now() - t0);
  // Named after what loaded: the scene, or the valley's seed (the default one included).
  const name = (args.get('name') ?? (await game.run<string>('sightline.state().scene ?? sightline.state().seed'))).replace(/[^A-Za-z0-9-]+/g, '-');
  await game.run('sightline.play()');
  if (lookAt) await game.run(`sightline.look(${lookAt.join(', ')})`);
  if (walk > 0) {
    // Counted in ticks, not wall time: a headless browser runs the game slower than real time.
    const from = await game.run<number>('sightline.state().tick');
    await game.run(`sightline.hold(['KeyW'])`);
    await game.until(`sightline.state().tick >= ${from + Math.round(walk * defaultTuning.sim.tickHz)}`, 120_000 + walk * 30_000);
    await game.run('sightline.hold([])');
  }
  mkdirSync(out, { recursive: true });
  const shots: string[] = [];
  for (const view of views) {
    const debug = view === 'debug';
    if ((await game.run<boolean>(`sightline.state().contexts.includes('debug')`)) !== debug) await game.run(`sightline.debug(${debug})`);
    // The fly camera is the debug view's (leaving the debug view leaves it).
    if (debug && fly) await game.run(`sightline.fly(${fly.join(', ')})`);
    // A switch names the new view or camera for a moment: the picture waits until that's gone,
    // and long enough for a software GPU to draw a few frames.
    await game.until(`!document.querySelector('.toast.is-on')`, 10_000);
    await game.page.waitForTimeout(waitMs);
    const file = path.join(out, `${name}-${view}.png`);
    await game.page.screenshot({ path: file });
    shots.push(path.relative(process.cwd(), file));
  }
  const seen = await game.run<Record<string, unknown>>(
    `(({ seed, scene, tick, camera, aim, overlay, overlayVisible }) => ({ seed, scene, tick, camera, aim, overlay: overlayVisible ? overlay : null }))(sightline.state())`,
  );
  console.log(JSON.stringify({ url: game.url, loadedMs, ...seen, shots, errors: game.errors }, null, 2));
  process.exitCode = game.errors.length ? 1 : 0;
} finally {
  await game.close();
}
process.exit();
