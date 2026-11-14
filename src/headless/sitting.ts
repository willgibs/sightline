/**
 * A sitting's link, played headless as the page plays it: the scene and parameters from
 * its address, under the mission's rules, by a scripted person doing roughly what its
 * steps ask, for as long as the sitting takes. It prints what the camp did and when, and
 * when and why the run ended. The playing is the lab's (src/lab/sitting.ts, which says why
 * this exists); the sittings bench plays every sitting the plan links to the same way
 * (`npm run experiment -- sittings`).
 *
 *   npm run sitting -- takedown 'seed=LEB-2534&perch=1'
 *   npm run sitting -- 'https://sightline-brown.vercel.app/?scene=takedown&params=seed=LEB-2534%26perch=1&lab'
 *     --shots 3          rounds he fires, six seconds apart, at whoever the perch sees best (0: he only watches)
 *     --at tower         what he fires at: `tower` (a man on a raised post), `door` (a man on the target's door), a role (sentry, patrol, worker, ...),
 *                        or `generator` or `box` (the camp's generator, an alarm box: whether there's a line to it from where he lies is part of the answer)
 *     --suppressed       the suppressor is fitted
 *     --subsonic         the subsonic load is in the rifle (it drops heavily: give him --from)
 *     --from 90          he lies this many metres from the first man he fires at, with a clear line, and not on the overview
 *     --spare-door       he never shoots a man on the target's door
 *     --seconds 420      how long to play
 *     --hurt             he can be shot. By default he can't, so the run shows what the camp does and not how long he lasts
 *     --dead-vehicle     the target's vehicle is sabotaged before the first shot
 *     --why              each step the camp takes, back to what a man sensed: who went for the alarm, and on what
 *
 * He is a marksman lying on the camp's best overview, which is where `perch=1` starts a
 * run. A link that starts at the valley's edge is played by a man who stays there and does
 * nothing: this says how the run goes when nobody troubles the camp, and no more.
 */
import { defaultTuning } from '../config/tuning';
import { AS_LINKED, Unplayable, playSitting, sceneOfLink } from '../lab/sitting';
import { parseArgs } from './args';

const argv = process.argv.slice(2);
const args = parseArgs(argv);
const FLAGS = ['--spare-door', '--hurt', '--dead-vehicle', '--suppressed', '--subsonic', '--why'];
const named = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1]!.startsWith('--') && !argv[i - 1]!.includes('=') && !FLAGS.includes(argv[i - 1]!)));

function fail(why: string): never {
  console.error(why);
  process.exit(2);
}

/** The scene and its parameters: given as two words, or as the address a sitting links to. */
function asked(): { name: string; params: string } {
  const first = named[0];
  if (!first) fail("Which sitting? npm run sitting -- takedown 'seed=LEB-2534&perch=1', or the link's own address.");
  if (!/^https?:/.test(first)) return { name: first, params: named[1] ?? '' };
  const link = sceneOfLink(first);
  if (!link) fail(`That address names no scene: ${first}`);
  return { name: link.scene, params: link.params };
}

const { name, params } = asked();
try {
  playSitting(
    { scene: name, params },
    {
      shots: Number(args.get('shots') ?? AS_LINKED.shots),
      seconds: Number(args.get('seconds') ?? AS_LINKED.seconds),
      at: args.get('at'),
      suppressed: args.has('suppressed'),
      subsonic: args.has('subsonic'),
      from: args.has('from') ? Number(args.get('from')) : undefined,
      spareDoor: args.has('spare-door'),
      hurt: args.has('hurt'),
      deadVehicle: args.has('dead-vehicle'),
      why: args.has('why'),
    },
    defaultTuning,
    (line) => console.log(line),
  );
} catch (e) {
  if (e instanceof Unplayable) fail(e.message);
  throw e;
}
