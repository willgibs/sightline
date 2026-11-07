/**
 * Headless run: generate a valley, let a bot play it at full speed with no rendering,
 * record everything, then re-simulate the recording and check it matches bit for bit.
 *
 *   npm run sim -- --seed TAL-4471 --minutes 10 --out run.slrec
 *   npm run sim -- --profile                                 (time spent in each system)
 *   npm run sim -- --replay sightline-TAL-4471-5400.slrec   (a recording saved in the browser)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { defaultTuning } from '../config/tuning';
import { normalizeSeed } from '../sim/core/seed';
import { generateWorld, type SpawnKind } from '../sim/gen/world';
import { neutralInput } from '../sim/input';
import { Recorder, Recording } from '../sim/record/recording';
import { resimulate } from '../sim/record/resim';
import { Simulation } from '../sim/sim';
import { WanderBot } from '../sim/bots/wander';
import { SystemProfile } from '../sim/profile';
import { fmt, parseArgs } from './args';
import { missionSpec } from '../sim/mission';

const args = parseArgs(process.argv.slice(2));
const now = (): number => performance.now();

const replay = args.get('replay');
if (replay) {
  const rec = Recording.fromBytes(new Uint8Array(readFileSync(replay)));
  const h = rec.header;
  console.log(`\nSIGHTLINE replay · ${replay}`);
  console.log(`seed ${h.seed} · ${h.ticks.toLocaleString('en-US')} ticks (${fmt.clock(h.ticks / h.tickHz)}) · recorded ${h.createdAt}`);
  if (h.tuningChanged) console.log('note    tuning was hot-reloaded during this run, so it cannot re-simulate exactly');
  const re = resimulate(rec, undefined, now);
  console.log(
    `resim   ${re.finalHash} vs recorded ${h.finalHash} · ${re.ok ? '✓ identical' : '✗ DIVERGED'}` +
      (re.firstDivergence !== null ? ` · first divergence at tick ${re.firstDivergence}` : '') +
      ` · ${fmt.ms(re.ms)}\n`,
  );
  process.exit(re.ok ? 0 : 1);
}

const seed = normalizeSeed(args.get('seed'));
const minutes = Number(args.get('minutes') ?? 5);
const spawn = (args.get('spawn') ?? 'overlook') as SpawnKind;
const out = args.get('out');
const tuning = defaultTuning;

console.log(`\nSIGHTLINE headless · seed ${seed} · ${minutes} min · bot wander\n`);

const world = generateWorld(missionSpec(seed, spawn), tuning, now);
const r = world.report;
console.log(
  `world   generated in ${fmt.ms(world.genMs)}${world.attempt ? ` (${world.attempt} re-roll${world.attempt > 1 ? 's' : ''})` : ''}` +
    ` · ${world.terrain.n}×${world.terrain.n} heights · relief ${world.terrain.minHeight.toFixed(0)}–${world.terrain.maxHeight.toFixed(0)} m`,
);
console.log(
  `        ${fmt.int(world.props.trees.length)} trees · ${fmt.int(world.props.rocks.length)} rocks · ${fmt.int(world.props.bushes.length)} bushes · ` +
    `${world.camp.guards.length} guards · ${fmt.int(world.colliders.list.length)} colliders`,
);
console.log(
  `        overwatch from ${r.overwatchSectors}/8 directions (${r.perches.length} perches) · camp reachable from ${r.accessSectors}/16 · ` +
    `${(r.steepShare * 100).toFixed(1)}% too steep to walk`,
);

const sim = new Simulation(world, tuning);
const profile = args.has('profile') ? new SystemProfile(now) : null;
sim.profiler = profile;
const recorder = new Recorder(sim, spawn);
const bot = new WanderBot(seed);
const raw = neutralInput();
const ticks = Math.round(minutes * 60 * tuning.sim.tickHz);
let walked = 0;
let footsteps = 0;
let stances = 0;
let lastX = sim.player.x;
let lastZ = sim.player.z;
const t0 = now();
for (let i = 0; i < ticks; i++) {
  const events = sim.step(bot.next(sim, raw));
  recorder.record(sim, events);
  for (const e of events) {
    if (e.type === 'footstep' && e.source === -1) footsteps++;
    if (e.type === 'stance') stances++;
  }
  const dx = sim.player.x - lastX;
  const dz = sim.player.z - lastZ;
  walked += Math.sqrt(dx * dx + dz * dz);
  lastX = sim.player.x;
  lastZ = sim.player.z;
}
const runMs = now() - t0;
const simSeconds = ticks / tuning.sim.tickHz;
console.log(
  `run     ${fmt.int(ticks)} ticks (${fmt.clock(simSeconds)} of play) in ${fmt.ms(runMs)} · ` +
    `${fmt.int(ticks / (runMs / 1000))} ticks/s (${fmt.int(simSeconds / (runMs / 1000))}× real time) · ` +
    `${((runMs / ticks) * 1000).toFixed(1)} µs/tick`,
);
if (profile) {
  const rows = profile.report(ticks);
  const total = rows.reduce((sum, r) => sum + r.usPerTick, 0);
  for (const r of rows) {
    console.log(
      `        ${r.phase.padEnd(11)} ${r.name.padEnd(14)} ${r.usPerTick.toFixed(2).padStart(7)} µs/tick · ${((r.usPerTick / total) * 100).toFixed(0).padStart(3)}%` +
        (r.runs !== ticks ? ` · ran ${fmt.int(r.runs)} times` : ''),
    );
  }
}
console.log(
  `player  walked ${fmt.int(walked)} m · ${fmt.int(footsteps)} footsteps · ${stances} stance changes · ` +
    `targets reached ${bot.reached}, abandoned ${bot.abandoned}`,
);

const rec = recorder.finish(sim, new Date().toISOString());
const bytes = rec.toBytes();
const sizes = recorder.sizes;
console.log(
  `record  ${fmt.kb(bytes.length)} total · inputs ${fmt.kb(sizes.inputs)} · states ${fmt.kb(sizes.states)} (${fmt.int(rec.stateCount)} samples) · ` +
    `events ${fmt.kb(sizes.events)} (${fmt.int(rec.eventCount)})`,
);
if (out) {
  writeFileSync(out, bytes);
  console.log(`        saved to ${out}`);
}

const loaded = Recording.fromBytes(bytes);
// Regenerate the world from the recording's own header, so the check covers generation too.
const re = resimulate(loaded, undefined, now);
console.log(`hash    ${rec.header.finalHash}`);
console.log(
  `resim   ${re.finalHash} ${re.ok ? '✓ identical' : '✗ DIVERGED'} · ${rec.header.checkpoints.length} checkpoints · ${fmt.ms(re.ms)}` +
    (re.firstDivergence !== null ? ` · first divergence at tick ${re.firstDivergence}` : ''),
);
console.log('');
process.exit(re.ok ? 0 : 1);
