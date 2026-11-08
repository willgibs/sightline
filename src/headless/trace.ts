/**
 * A run, tick by tick: what `npm run explain` and `npm run bisect` compare between two
 * builds. Its output is read by other builds of this tool, so it changes only by adding
 * options and fields.
 *
 *   npm run trace -- --list                         the pinned runs and their lanes, as JSON
 *   npm run trace -- --run "TAL-4471 wander"        per tick: {"tick","behaviour","state"}, one JSON line each
 *   npm run trace -- --recording <file.slrec>       the same for a recording's inputs, re-simulated
 *                                                   even if another build made it
 *   ... --dump <tick>                               the state tree at the end of that tick (0: before the first), as JSON
 *   ... --dump <tick> --after <system>              the state right after that system ran, in that tick
 *   ... --phases <tick>                             per system of that tick: {"system","phase","state"}, one line each
 */
import { readFileSync } from 'node:fs';
import { sceneOf } from '../sim/game/scenes';
import { PINNED_RUNS, behaviourInto, pinnedRun, type Run } from '../sim/game/runs';
import { SIGHTLINE } from '../sim/game/sim';
import { Hasher } from '../sim/kernel/core/hash';
import { neutralInput } from '../sim/kernel/input';
import { Recording } from '../sim/kernel/record/recording';
import { replaySimulation } from '../sim/kernel/record/resim';
import { parseArgs } from './args';

const args = parseArgs(process.argv.slice(2));
if (args.has('list')) {
  console.log(JSON.stringify(PINNED_RUNS.map((r) => ({ name: r.name, lane: r.lane }))));
  process.exit(0);
}
const name = args.get('run');
const file = args.get('recording');
if (!name && !file) {
  console.error('Usage: npm run trace -- --list | (--run <name> | --recording <file>) [--dump <tick> [--after <system>] | --phases <tick>]');
  process.exit(2);
}

/** A recording's inputs, re-simulated in this build whatever build made it: the comparison is the point. */
function recordingRun(path: string): Run {
  const rec = Recording.fromBytes(new Uint8Array(readFileSync(path)));
  const sim = replaySimulation(rec, { game: SIGHTLINE, scene: sceneOf(rec.header), force: true });
  if (typeof sim === 'string') throw new Error(`Can't re-simulate ${path}: ${sim}`);
  const changes = rec.tuningChanges();
  const input = neutralInput();
  let change = 0;
  return {
    sim,
    step() {
      while (change < changes.length && changes[change]!.tick === sim.tick + 1) sim.setTuning(changes[change++]!.tuning);
      rec.readInput(sim.tick, input);
      return sim.step(input);
    },
    get over() {
      return sim.tick >= (rec.header.fault ? rec.header.ticks - 1 : rec.header.ticks);
    },
  };
}

const run = file ? recordingRun(file) : pinnedRun(name!).start();
const out = (v: unknown): void => void process.stdout.write(JSON.stringify(v) + '\n');
const dump = args.has('dump') ? Number(args.get('dump')) : null;
const phases = args.has('phases') ? Number(args.get('phases')) : null;
const after = args.get('after');
const target = dump ?? phases;

if (target === 0 && dump !== null) {
  out(run.sim.state);
  process.exit(0);
}
if (target !== null) {
  // Up to the tick before, then the tick itself, system by system.
  while (!run.over && run.sim.tick < target - 1) run.step();
  if (run.over) {
    console.error(`The run ends at tick ${run.sim.tick}, before tick ${target}`);
    process.exit(1);
  }
  run.sim.profiler = {
    begin: () => {},
    end: (system) => {
      if (phases !== null) out({ system: system.name, phase: system.phase, state: run.sim.hash() });
      else if (after === system.name) {
        out(run.sim.state);
        process.exit(0);
      }
    },
  };
  run.step();
  if (dump !== null) {
    if (after !== undefined) {
      console.error(`No system '${after}' ran in tick ${dump}`);
      process.exit(1);
    }
    out(run.sim.state);
  }
  process.exit(0);
}

const lines: string[] = [];
while (!run.over) {
  const events = run.step();
  const h = new Hasher();
  behaviourInto(h, run.sim, events);
  lines.push(JSON.stringify({ tick: run.sim.tick, behaviour: h.digest(), state: run.sim.hash() }));
}
process.stdout.write(lines.join('\n') + '\n');
