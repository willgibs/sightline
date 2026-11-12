/**
 * The long invariant run: bots play many valleys for a long time while every body is
 * checked after every tick (sim/body/invariants.ts). A run that breaks a promise is saved
 * as a recording that reproduces it: `npm run sim -- --replay <file>` re-simulates it.
 * Every run has a name, the first word of its line, and a bot, the second; a run that
 * breaks a promise prints the command that plays it again.
 *
 *   npm run fuzz                                    6 fresh valleys × both bots × 10 min, and their towers' ladders and their camps' stairs
 *   npm run fuzz -- --seeds 20 --minutes 60         longer (the weekly CI run)
 *   npm run fuzz -- --seed TAL-4471                 one valley again, all of it: both bots, its towers and its stairs
 *   npm run fuzz -- --run tower:RES-2063-3          one run again, by its name: a valley, `tower:…`, `stairs:…` or `scene:…`
 *   npm run fuzz -- --run TAL-4471 --bot chaos      and by its bot: wander or chaos in a valley or a scene, flight2 on stairs
 *   npm run fuzz -- --no-scenes                     valleys only: no movement scenes, towers or stairs
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
import { StairBot } from '../sim/game/bots/stairBot';
import { placePlayer } from '../sim/game/setup';
import { InvariantWatch } from '../sim/body';
import { WanderBot } from '../sim/game/bots/wander';
import { normalizeSeed, randomSeed } from '../sim/kernel/core/seed';
import { generateWorld } from '../sim/generation';
import { neutralInput } from '../sim/kernel/input';
import { missionSpec } from '../sim/kernel/mission';
import { Recorder } from '../sim/kernel/record/recording';
import { startScene } from '../sim/kernel/scene';
import { SCENES } from '../sim/game/scenes';
import { TOWER_SECONDS } from '../sim/game/scenes/ladderTower';
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
/** One run again, by the name its line began with. */
const again = args.get('run');
// Fresh valleys every run, named so a failure can be run again.
const seeds = again ? [] : one ? [normalizeSeed(one)] : Array.from({ length: Number(args.get('seeds') ?? 6) }, () => randomSeed());
const extras = !again && !args.has('no-scenes');
// The movement scenes go with them: their walls, windows, ladder, crawl space and guards are where the
// motor's modes are worked hardest (a fresh valley has few of them). They aren't any one valley's.
const scenes = extras && !one ? ['movement-lab', 'movement-course'] : [];
// A valley has no ladders and the lab has one a bot seldom finds, so ladders get towers and a bot of their own:
// many short runs, because a bot left on one tower for long ends up stuck at the top of it or wandering off.
const towers = extras ? seeds.flatMap((s) => [0, 1, 2, 3, 4].map((k) => `tower:${s}-${k}`)) : [];
const TOWER_MINUTES = TOWER_SECONDS / 60;
// Stairs, the same way: a valley's bots seldom go indoors and never upstairs, so every flight of each
// valley's camp gets a bot that goes up and down it and makes trouble on it (bots/stairBot.ts).
const stairs = extras ? seeds.map((s) => `stairs:${s}`) : [];
const asked = (args.get('bot') ?? '').split(',').map((b) => b.trim()).filter((b) => b !== '');
// Which bots play a valley or a scene, and which flights of a camp's stairs are played: all of them, unless some are named.
const bots = asked.some((b) => b === 'wander' || b === 'chaos') ? asked.filter((b) => b === 'wander' || b === 'chaos') : ['wander', 'chaos'];
const flights = asked.filter((b) => /^flight\d+$/.test(b));
const outDir = args.get('out') ?? '.';
const synctest = args.has('synctest') ? (args.get('synctest') === 'true' ? 30 : Number(args.get('synctest'))) : 0;
const tuning = defaultTuning;
const build = buildStamp();
/** Every run, by name: a valley's seed, `scene:<scene>`, `tower:<any word>` or `stairs:<a valley's seed>`. */
const names = again ? [/^(scene|tower|stairs):/.test(again) ? again : normalizeSeed(again)] : [...seeds, ...scenes.map((s) => `scene:${s}`), ...towers, ...stairs];
const unknown = names.filter((n) => n.startsWith('scene:') && !SCENES[n.slice(6)]);
// A name left off ('--run' alone) parses as 'true', which is nobody's name.
const unnamed = one === 'true' || again === 'true' || (again !== undefined && one !== undefined);
if (!(minutes > 0) || asked.some((b) => b !== 'wander' && b !== 'chaos' && b !== 'ladder' && !/^flight\d+$/.test(b)) || !(synctest >= 0 && Number.isInteger(synctest)) || unnamed || unknown.length > 0) {
  if (unknown.length > 0) console.error(`No scene called ${unknown.map((n) => n.slice(6)).join(', ')}.`);
  console.error('Usage: npm run fuzz -- [--seeds N | --seed NAME | --run NAME] [--minutes M] [--bot wander,chaos,flightN] [--no-scenes] [--out DIR] [--synctest [N]]');
  process.exit(2);
}

console.log(
  `\nSIGHTLINE fuzz · ${again ? again : `${seeds.length} valley${seeds.length === 1 ? '' : 's'} × ${bots.join(', ')}`} · ${minutes} min each${synctest ? ` · synctest every ${synctest} ticks` : ''} · build ${build}`,
);
if (!again) console.log(`seeds   ${seeds.join(' ')}`);
console.log('');

let failed = 0;
let played = 0;
let totalTicks = 0;
const t0 = performance.now();
for (const seed of names) {
  const tower = seed.startsWith('tower:');
  const stair = seed.startsWith('stairs:');
  const scene = tower ? SCENES['ladder-tower']!(`seed=${seed.slice(6)}`) : seed.startsWith('scene:') ? SCENES[seed.slice(6)]!() : null;
  const world = scene ? scene.world(tuning) : generateWorld(missionSpec(stair ? seed.slice(7) : seed), tuning);
  const every = world.grid.stairs.map((_, k) => `flight${k}`);
  for (const name of tower ? ['ladder'] : stair ? (flights.length > 0 ? every.filter((f) => flights.includes(f)) : every) : bots) {
    /** A run's simulation as it starts: on a flight's run, the player at the foot of it. */
    const fresh = (): Simulation => {
      const made: Simulation = scene ? (startScene(scene, tuning, world) as Simulation) : new Simulation(world, tuning);
      if (stair) {
        const st = world.grid.stairs[Number(name.slice(6))]!;
        placePlayer(made, st.footX, st.footZ, st.headX - st.footX, st.headZ - st.footZ);
      }
      return made;
    };
    const sim = fresh();
    const recorder = new Recorder(sim, build);
    const watch = new InvariantWatch(sim);
    const sync = synctest ? new SyncTest(sim, fresh(), synctest) : null;
    const bot = name === 'ladder' ? new LadderBot(seed) : stair ? new StairBot(seed, Number(name.slice(6))) : name === 'chaos' ? new ChaosBot(seed) : new WanderBot(seed);
    const raw = neutralInput();
    const ticks = Math.round((tower || stair ? Math.min(minutes, TOWER_MINUTES) : minutes) * 60 * tuning.sim.tickHz);
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
    played++;
    totalTicks += r.ticks;
    const line =
      `${seed} ${name.padEnd(6)} ${fmt.clock(r.ticks / tuning.sim.tickHz).padStart(6)} · ${fmt.int(r.checks)} body-ticks · ` +
      `rise ≤ ${(r.worstRise * 1000).toFixed(1)} mm · overlap ≤ ${(r.worstOverlap * 1000).toFixed(3)} mm · steep gain ≤ ${(r.steepGain * 1000).toFixed(2)} mm (at seams ≤ ${(r.seamGain * 1000).toFixed(1)}) · ` +
      (bot instanceof StairBot ? `up ${bot.ups}, down ${bot.downs} · ` : '') +
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
    // The same run again: its name, its bot where the name has more than one, and whatever else decides what is played and checked.
    console.log(
      `  again: npm run fuzz -- --run ${seed}${tower ? '' : ` --bot ${name}`}${args.has('minutes') ? ` --minutes ${minutes}` : ''}${synctest ? ` --synctest${synctest === 30 ? '' : ` ${synctest}`}` : ''}`,
    );
  }
}
if (played === 0) {
  console.error(`Nothing was played: ${names.join(', ') || 'no run'} has no ${asked.join(' or ') || 'bot'}.`);
  process.exit(2);
}
const s = (performance.now() - t0) / 1000;
console.log(
  `\n${failed ? `${failed} run(s) broke a promise.` : 'Every promise held.'} ${fmt.int(totalTicks)} ticks (${fmt.clock(totalTicks / tuning.sim.tickHz)} of play) in ${s.toFixed(1)} s\n`,
);
process.exit(failed ? 1 : 0);
