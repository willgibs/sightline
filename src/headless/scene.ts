/**
 * Runs scenes headless: each with its own driver, checking its expectations, then
 * re-simulating its recording bit for bit. A scene with parameters (a scenario) runs once
 * for each row of its table (scenes/index.ts, SCENARIOS), or with the parameters given.
 *
 *   npm run scene                          every scene, and every scenario's table
 *   npm run scene -- movement-course       one scene
 *   npm run scene -- sight                 one scenario's table
 *   npm run scene -- sight --params 'spot=shade&d=30&stance=crouch&move=walk&expect=3-6'
 *   npm run scene -- --list                what scenes there are
 *   npm run scene -- movement-course --out course.slrec
 */
import { writeFileSync } from 'node:fs';
import { defaultTuning } from '../config/tuning';
import { resimulate } from '../sim/kernel/record/resim';
import { runScene } from '../sim/kernel/scene';
import { SCENARIOS, SCENES } from '../sim/game/scenes';
import { fmt, parseArgs } from './args';
import { buildStamp } from './build';

const argv = process.argv.slice(2);
const args = parseArgs(argv);
const names = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1]!.startsWith('--') && !argv[i - 1]!.includes('=') && argv[i - 1] !== '--list'));
const now = (): number => performance.now();

if (args.has('list')) {
  for (const [name, make] of Object.entries(SCENES)) {
    const s = make();
    console.log(`${name.padEnd(22)} v${s.version}  ${s.title}: ${s.description}`);
  }
  process.exit(0);
}

const unknown = names.filter((n) => !SCENES[n]);
if (unknown.length) {
  console.error(`No scene called ${unknown.join(', ')}. Scenes: ${Object.keys(SCENES).join(', ')}`);
  process.exit(2);
}

/** Every run asked for: a scene, or a scenario with each row of its table (or the parameters given). */
const runs: Array<{ name: string; params?: string }> = [];
for (const name of names.length ? names : Object.keys(SCENES)) {
  const given = args.get('params');
  const table = SCENARIOS[name];
  if (given !== undefined) runs.push({ name, params: given });
  else if (table) for (const params of table) runs.push({ name, params });
  else runs.push({ name });
}

let failed = 0;
for (const { name, params } of runs) {
  const scene = SCENES[name]!(params);
  const t0 = now();
  const run = runScene(scene, defaultTuning, { build: buildStamp(), seconds: args.has('seconds') ? Number(args.get('seconds')) : undefined });
  const ms = now() - t0;
  const re = resimulate(run.recording, { scene, clock: now });
  const ok = run.failures.length === 0 && re.ok;
  if (!ok) failed++;
  const p = run.sim.player;
  console.log(`\n${ok ? '✓' : '✗'} ${scene.title} (${name} v${scene.version}${scene.params ? ` · ${scene.params}` : ''}) · ${fmt.int(run.sim.tick)} ticks (${fmt.clock(run.sim.tick / defaultTuning.sim.tickHz)}) in ${fmt.ms(ms)}`);
  console.log(`  player ends at ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)} · ${p.stance}`);
  for (const f of run.failures) console.log(`  ✗ ${f}`);
  for (const e of scene.expect ?? []) if (!run.failures.some((f) => f.startsWith(`${e.name}:`))) console.log(`  ✓ ${e.name}`);
  console.log(`  resim ${re.ok ? '✓ identical' : `✗ ${re.problem ?? 'DIVERGED'}`} · ${fmt.ms(re.ms)}`);
  const out = args.get('out');
  if (out) {
    writeFileSync(out, run.recording.toBytes());
    console.log(`  saved ${out}`);
  }
}
console.log('');
process.exit(failed ? 1 : 0);
