/**
 * What if: a run forked at a tick, with one thing changed (src/lab/fork.ts), and how each
 * branch came out.
 *
 *   npm run whatif -- --scene overlook --params 'seed=LEB-2534&plan=clear&pace=5' --at first-shot+2 --do move:30 --do move:100
 *   npm run whatif -- --recording playtests/some.slrec --at 60 --do remove:officer
 *
 *   --scene <name> [--params <p>]   a scene, played by its own driver
 *   --recording <file>              or a recording, re-simulated from its inputs
 *   --at <seconds> | --at-tick <n> | --at first-shot[+seconds]    where to fork
 *   --do <change>                   a branch, as many as you like (none, move:<metres>,
 *                                   move:<x>,<z>, remove:<id|role>, off:<parts>, patch:<path>=<n>)
 *   --seconds <n>                   how long the run lasts, for a scene
 *   --dice <n>                      which roll of the dice to run on (0, the default, is the game's own)
 */
import { readFileSync } from 'node:fs';
import { defaultTuning } from '../config/tuning';
import { withDice } from '../lab/experiment';
import { firstTick, forkRun, formatFork, noChange, parseIntervention, recordingRun, sceneRun, type Intervention, type RunSource } from '../lab/fork';
import { SCENES, sceneOf } from '../sim/game/scenes';
import type { Simulation } from '../sim/game/sim';
import { Recording } from '../sim/kernel/record/recording';
import { parseArgs } from './args';

const argv = process.argv.slice(2);
const args = parseArgs(argv);

function usage(problem: string): never {
  console.error(`${problem}\n\nUsage: npm run whatif -- (--scene <name> [--params <p>] | --recording <file>) --at <seconds | first-shot[+s]> --do <change> [--do <change>] [--seconds <n>] [--dice <n>]`);
  process.exit(2);
}

/** Every `--do`, in order: the argument parser keeps only the last of a repeated flag. */
function changes(): Intervention[] {
  const out: Intervention[] = [];
  for (let k = 0; k < argv.length; k++) {
    if (argv[k] === '--do' && argv[k + 1] !== undefined) out.push(parseIntervention(argv[k + 1]!));
    else if (argv[k]!.startsWith('--do=')) out.push(parseIntervention(argv[k]!.slice(5)));
  }
  return out.length > 0 ? out : [noChange()];
}

function source(): { run: RunSource; hz: number } {
  const file = args.get('recording');
  if (file) {
    const rec = Recording.fromBytes(new Uint8Array(readFileSync(file)));
    return { run: recordingRun(rec, sceneOf(rec.header)), hz: rec.header.tickHz };
  }
  const name = args.get('scene');
  if (!name) usage('Name a scene or a recording.');
  const make = SCENES[name];
  if (!make) usage(`No scene called '${name}'.`);
  const tuning = withDice(defaultTuning, Number(args.get('dice') ?? 0));
  const seconds = args.get('seconds');
  return { run: sceneRun(make(args.get('params')), tuning, seconds ? { seconds: Number(seconds) } : {}), hz: tuning.sim.tickHz };
}

function forkTick(run: RunSource, hz: number): number {
  const exact = args.get('at-tick');
  if (exact) return Number(exact);
  const at = args.get('at');
  if (!at) usage('Say where to fork: --at <seconds>, --at-tick <tick> or --at first-shot[+seconds].');
  const m = /^first-shot(?:\+([\d.]+))?$/.exec(at);
  if (!m) return Math.round(Number(at) * hz);
  const shot = firstTick(run, (sim: Simulation, events) => events.some((e) => e.type === 'shot' && e.source === sim.playerId));
  if (shot === null) usage('The player never fires in this run.');
  return shot + Math.round(Number(m[1] ?? 0) * hz);
}

const { run, hz } = source();
const at = forkTick(run, hz);
console.log(formatFork(forkRun(run, at, changes())));
