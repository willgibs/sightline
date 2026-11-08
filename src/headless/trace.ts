/**
 * One pinned run (src/sim/game/runs.ts), tick by tick: what `npm run explain` and
 * `npm run bisect` compare between two builds. Its output is read by other builds of this
 * tool, so it changes only by adding fields.
 *
 *   npm run trace -- --list                      the pinned runs and their lanes, as JSON
 *   npm run trace -- --run "TAL-4471 wander"     per tick: {"tick","behaviour","state"}, one JSON line each
 *   npm run trace -- --run <name> --dump <tick>  the state tree at the end of that tick, as JSON
 */
import { PINNED_RUNS, behaviourInto, pinnedRun } from '../sim/game/runs';
import { Hasher } from '../sim/kernel/core/hash';
import { parseArgs } from './args';

const args = parseArgs(process.argv.slice(2));
if (args.has('list')) {
  console.log(JSON.stringify(PINNED_RUNS.map((r) => ({ name: r.name, lane: r.lane }))));
  process.exit(0);
}
const name = args.get('run');
if (!name) {
  console.error('Usage: npm run trace -- --list | --run <name> [--dump <tick>]');
  process.exit(2);
}
const run = pinnedRun(name).start();
const dump = args.has('dump') ? Number(args.get('dump')) : null;
const lines: string[] = [];
while (!run.over) {
  const events = run.step();
  const tick = run.sim.tick;
  if (dump !== null) {
    if (tick === dump) {
      process.stdout.write(JSON.stringify(run.sim.state) + '\n');
      process.exit(0);
    }
    continue;
  }
  const h = new Hasher();
  behaviourInto(h, run.sim, events);
  lines.push(JSON.stringify({ tick, behaviour: h.digest(), state: run.sim.hash() }));
}
if (dump !== null) {
  console.error(`'${name}' ends at tick ${run.sim.tick}, before tick ${dump}`);
  process.exit(1);
}
process.stdout.write(lines.join('\n') + '\n');
