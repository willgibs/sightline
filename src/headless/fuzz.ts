/**
 * The long invariant run: bots play many valleys for a long time while every body is
 * checked after every tick (sim/body/invariants.ts). A run that breaks a promise is saved
 * as a recording that reproduces it: `npm run sim -- --replay <file>` re-simulates it.
 *
 *   npm run fuzz                                    6 fresh valleys × both bots × 10 min
 *   npm run fuzz -- --seeds 20 --minutes 60         longer (the weekly CI run)
 *   npm run fuzz -- --seed TAL-4471 --bot chaos     one valley, one bot
 *   npm run fuzz -- --out fuzz-failures             where failing runs' recordings go
 *   npm run fuzz -- --synctest                      also save, restore and re-step every 30 ticks,
 *                                                   through the on-disk codec and a rollback, and
 *                                                   compare every tick (kernel/synctest.ts);
 *                                                   --synctest N for every N ticks
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultTuning } from '../config/tuning';
import { ChaosBot } from '../sim/game/bots/chaos';
import { LadderBot } from '../sim/game/bots/ladderBot';
import { InvariantWatch } from '../sim/body';
import { WanderBot } from '../sim/game/bots/wander';
import { normalizeSeed, randomSeed } from '../sim/kernel/core/seed';
import { generateWorld } from '../sim/generation';
import { neutralInput } from '../sim/kernel/input';
import { missionSpec } from '../sim/kernel/mission';
import { Recorder } from '../sim/kernel/record/recording';
import { startScene } from '../sim/kernel/scene';
import { SCENES } from '../sim/game/scenes';
import { Simulation } from '../sim/game/sim';
import { SyncTest, describeSyncFailure } from '../sim/kernel/synctest';
import { fmt, parseArgs } from './args';
import { buildStamp } from './build';
import { knownAnswerProblems } from '../sim/kernel/core/known';

const args = parseArgs(process.argv.slice(2));
const mathProblems = knownAnswerProblems();
if (mathProblems.length > 0) {
  console.error(`This engine's math differs from the known answers (kernel/core/known.ts), so nothing run here replays elsewhere:\n${mathProblems.join('\n')}`);
  process.exit(1);
}
const minutes = Number(args.get('minutes') ?? 10);
const one = args.get('seed');
// Fresh valleys every run, named so a failure can be run again.
const seeds = one ? [normalizeSeed(one)] : Array.from({ length: Number(args.get('seeds') ?? 6) }, () => randomSeed());
// The movement scenes go with them: their walls, windows, ladder, crawl space and guards are where the
// motor's modes are worked hardest (a fresh valley has few of them).
const scenes = one || args.has('no-scenes') ? [] : ['movement-lab', 'movement-course'];
// A valley has no ladders and the lab has one a bot seldom finds, so ladders get towers and a bot of their own:
// many short runs, because a bot left on one tower for long ends up stuck at the top of it or wandering off.
const towers = one || args.has('no-scenes') ? [] : seeds.flatMap((s) => [0, 1, 2, 3, 4].map((k) => `tower:${s}-${k}`));
const TOWER_MINUTES = 4;
const bots = (args.get('bot') ?? 'wander,chaos').split(',').map((b) => b.trim());
const outDir = args.get('out') ?? '.';
const synctest = args.has('synctest') ? (args.get('synctest') === 'true' ? 30 : Number(args.get('synctest'))) : 0;
const tuning = defaultTuning;
const build = buildStamp();
if (!(minutes > 0) || bots.some((b) => b !== 'wander' && b !== 'chaos') || !(synctest >= 0 && Number.isInteger(synctest))) {
  console.error('Usage: npm run fuzz -- [--seeds N | --seed NAME] [--minutes M] [--bot wander,chaos] [--out DIR] [--synctest [N]]');
  process.exit(2);
}

console.log(`\nSIGHTLINE fuzz · ${seeds.length} valley${seeds.length === 1 ? '' : 's'} × ${bots.join(', ')} · ${minutes} min each${synctest ? ` · synctest every ${synctest} ticks` : ''} · build ${build}`);
console.log(`seeds   ${seeds.join(' ')}\n`);

let failed = 0;
let totalTicks = 0;
const t0 = performance.now();
for (const seed of [...seeds, ...scenes.map((s) => `scene:${s}`), ...towers]) {
  const tower = seed.startsWith('tower:');
  const scene = tower ? SCENES['ladder-tower']!(`seed=${seed.slice(6)}`) : seed.startsWith('scene:') ? SCENES[seed.slice(6)]!() : null;
  const world = scene ? scene.world(tuning) : generateWorld(missionSpec(seed), tuning);
  for (const name of tower ? ['ladder'] : bots) {
    const sim: Simulation = scene ? (startScene(scene, tuning, world) as Simulation) : new Simulation(world, tuning);
    const recorder = new Recorder(sim, build);
    const watch = new InvariantWatch(sim);
    const sync = synctest ? new SyncTest(sim, scene ? (startScene(scene, tuning, world) as Simulation) : new Simulation(world, tuning), synctest) : null;
    const bot = name === 'ladder' ? new LadderBot(seed) : name === 'chaos' ? new ChaosBot(seed) : new WanderBot(seed);
    const raw = neutralInput();
    const ticks = Math.round((tower ? Math.min(minutes, TOWER_MINUTES) : minutes) * 60 * tuning.sim.tickHz);
    const start = performance.now();
    for (let i = 0; i < ticks; i++) {
      watch.beforeTick();
      sync?.beforeTick();
      const events = sim.step(bot.next(sim, raw));
      recorder.record(sim, events);
      watch.afterTick();
      sync?.afterTick();
      // Stop at the first broken promise: the recording ends where it happened.
      if (watch.report.first || sync?.report.failure) break;
    }
    const r = watch.report;
    totalTicks += r.ticks;
    const line =
      `${seed} ${name.padEnd(6)} ${fmt.clock(r.ticks / tuning.sim.tickHz).padStart(6)} · ${fmt.int(r.checks)} body-ticks · ` +
      `rise ≤ ${(r.worstRise * 1000).toFixed(1)} mm · overlap ≤ ${(r.worstOverlap * 1000).toFixed(3)} mm · steep gain ≤ ${(r.steepGain * 1000).toFixed(2)} mm · ` +
      (sync ? `${fmt.int(sync.report.saves)} restores, ${fmt.int(sync.report.ticks)} ticks re-stepped · ` : '') +
      fmt.ms(performance.now() - start);
    const syncFailure = sync?.report.failure ?? null;
    if (watch.sound && !syncFailure) {
      console.log(`✓ ${line}`);
      continue;
    }
    failed++;
    const tick = r.first?.tick ?? syncFailure!.tick;
    mkdirSync(outDir, { recursive: true });
    const file = join(outDir, `fuzz-${seed.replace(/[^A-Za-z0-9-]/g, '-')}-${name}-${tick}.slrec`);
    writeFileSync(file, recorder.finish(sim, new Date().toISOString()).toBytes());
    console.log(`✗ ${line}`);
    if (r.first) console.log(`  tick ${r.first.tick} · entity ${r.first.entity} · ${r.first.what} · saved ${file}`);
    if (syncFailure) console.log(`  synctest: ${describeSyncFailure(syncFailure)} · saved ${file}`);
  }
}
const s = (performance.now() - t0) / 1000;
console.log(
  `\n${failed ? `${failed} run(s) broke a promise.` : 'Every promise held.'} ${fmt.int(totalTicks)} ticks (${fmt.clock(totalTicks / tuning.sim.tickHz)} of play) in ${s.toFixed(1)} s\n`,
);
process.exit(failed ? 1 : 0);
