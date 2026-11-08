/**
 * The long invariant run: bots play many valleys for a long time while every body is
 * checked after every tick (sim/body/invariants.ts). A run that breaks a promise is saved
 * as a recording that reproduces it: `npm run sim -- --replay <file>` re-simulates it.
 *
 *   npm run fuzz                                    6 fresh valleys × both bots × 10 min
 *   npm run fuzz -- --seeds 20 --minutes 60         longer (the weekly CI run)
 *   npm run fuzz -- --seed TAL-4471 --bot chaos     one valley, one bot
 *   npm run fuzz -- --out fuzz-failures             where failing runs' recordings go
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultTuning } from '../config/tuning';
import { ChaosBot } from '../sim/game/bots/chaos';
import { InvariantWatch } from '../sim/body';
import { WanderBot } from '../sim/game/bots/wander';
import { normalizeSeed, randomSeed } from '../sim/kernel/core/seed';
import { generateWorld } from '../sim/generation';
import { neutralInput } from '../sim/kernel/input';
import { missionSpec } from '../sim/kernel/mission';
import { Recorder } from '../sim/kernel/record/recording';
import { Simulation } from '../sim/game/sim';
import { fmt, parseArgs } from './args';
import { buildStamp } from './build';

const args = parseArgs(process.argv.slice(2));
const minutes = Number(args.get('minutes') ?? 10);
const one = args.get('seed');
// Fresh valleys every run, named so a failure can be run again.
const seeds = one ? [normalizeSeed(one)] : Array.from({ length: Number(args.get('seeds') ?? 6) }, () => randomSeed());
const bots = (args.get('bot') ?? 'wander,chaos').split(',').map((b) => b.trim());
const outDir = args.get('out') ?? '.';
const tuning = defaultTuning;
const build = buildStamp();
if (!(minutes > 0) || bots.some((b) => b !== 'wander' && b !== 'chaos')) {
  console.error('Usage: npm run fuzz -- [--seeds N | --seed NAME] [--minutes M] [--bot wander,chaos] [--out DIR]');
  process.exit(2);
}

console.log(`\nSIGHTLINE fuzz · ${seeds.length} valley${seeds.length === 1 ? '' : 's'} × ${bots.join(', ')} · ${minutes} min each · build ${build}`);
console.log(`seeds   ${seeds.join(' ')}\n`);

let failed = 0;
let totalTicks = 0;
const t0 = performance.now();
for (const seed of seeds) {
  const world = generateWorld(missionSpec(seed), tuning);
  for (const name of bots) {
    const sim = new Simulation(world, tuning);
    const recorder = new Recorder(sim, build);
    const watch = new InvariantWatch(sim);
    const bot = name === 'chaos' ? new ChaosBot(seed) : new WanderBot(seed);
    const raw = neutralInput();
    const ticks = Math.round(minutes * 60 * tuning.sim.tickHz);
    const start = performance.now();
    for (let i = 0; i < ticks; i++) {
      watch.beforeTick();
      const events = sim.step(bot.next(sim, raw));
      recorder.record(sim, events);
      watch.afterTick();
      // Stop at the first broken promise: the recording ends where it happened.
      if (watch.report.first) break;
    }
    const r = watch.report;
    totalTicks += r.ticks;
    const line =
      `${seed} ${name.padEnd(6)} ${fmt.clock(r.ticks / tuning.sim.tickHz).padStart(6)} · ${fmt.int(r.checks)} body-ticks · ` +
      `rise ≤ ${(r.worstRise * 1000).toFixed(1)} mm · overlap ≤ ${(r.worstOverlap * 1000).toFixed(3)} mm · steep gain ≤ ${(r.steepGain * 1000).toFixed(2)} mm · ` +
      fmt.ms(performance.now() - start);
    if (watch.sound) {
      console.log(`✓ ${line}`);
      continue;
    }
    failed++;
    const f = r.first!;
    mkdirSync(outDir, { recursive: true });
    const file = join(outDir, `fuzz-${seed}-${name}-${f.tick}.slrec`);
    writeFileSync(file, recorder.finish(sim, new Date().toISOString()).toBytes());
    console.log(`✗ ${line}`);
    console.log(`  tick ${f.tick} · entity ${f.entity} · ${f.what} · saved ${file}`);
  }
}
const s = (performance.now() - t0) / 1000;
console.log(
  `\n${failed ? `${failed} run(s) broke a promise.` : 'Every promise held.'} ${fmt.int(totalTicks)} ticks (${fmt.clock(totalTicks / tuning.sim.tickHz)} of play) in ${s.toFixed(1)} s\n`,
);
process.exit(failed ? 1 : 0);
