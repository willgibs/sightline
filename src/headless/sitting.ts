/**
 * A sitting's link, played headless as the page plays it: the scene and parameters from
 * its address, under the mission's rules, by a scripted person doing roughly what its
 * steps ask, for as long as the sitting takes. It prints what the camp did and when, and
 * when and why the run ended.
 *
 * A sitting costs the owner's time, and the scene a number was measured on isn't always
 * the scene a person plays: what ends a run is the difference. On Nov 11 the hunt's
 * sitting went on the desk on a camp that drives its target away two and a half minutes
 * after a loud shot. That ended the run a minute before the hunters reached the shooter,
 * and the bench hadn't said so, because its scene has no rule to end it. And playing the
 * target's answer this way found its getaway hanging on the one guard a perch sees best.
 * So: run this on every link before it goes on the desk as ready.
 *
 *   npm run sitting -- takedown 'seed=LEB-2534&perch=1'
 *   npm run sitting -- 'https://sightline-brown.vercel.app/?scene=takedown&params=seed=LEB-2534%26perch=1&lab'
 *     --shots 3          rounds he fires, six seconds apart, at whoever the perch sees best (0: he only watches)
 *     --spare-door       he never shoots a man on the target's door
 *     --seconds 420      how long to play
 *     --hurt             he can be shot. By default he can't, so the run shows what the camp does and not how long he lasts
 *     --dead-vehicle     the target's vehicle is sabotaged before the first shot
 *
 * He is a marksman lying on the camp's best overview, which is where `perch=1` starts a
 * run. A link that starts at the valley's edge is played by a man who stays there and does
 * nothing: this says how the run goes when nobody troubles the camp, and no more.
 */
import { defaultTuning } from '../config/tuning';
import { huntOf, protectionOf } from '../lab/gauges';
import { MarksmanDriver, type Step } from '../sim/game/bots/marksman';
import { commanderOf } from '../sim/game/comms';
import { player } from '../sim/game/entities';
import { SCENES } from '../sim/game/scenes';
import { bestOverview } from '../sim/game/scenes/liveCamp';
import type { Simulation } from '../sim/game/sim';
import { sceneTuning, startScene, type Scene } from '../sim/kernel/scene';
import { parseArgs } from './args';

const argv = process.argv.slice(2);
const args = parseArgs(argv);
const FLAGS = ['--spare-door', '--hurt', '--dead-vehicle'];
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
  const url = new URL(first);
  const name = url.searchParams.get('scene');
  if (!name) fail(`That address names no scene: ${first}`);
  return { name, params: url.searchParams.get('params') ?? '' };
}

const { name, params } = asked();
const make = SCENES[name];
if (!make) fail(`No scene called ${name}. Scenes: ${Object.keys(SCENES).join(', ')}`);
const scene = make(params || undefined) as Scene<Simulation>;
const T = defaultTuning;
const sim = startScene(scene, sceneTuning(scene, T));
const hz = sim.tuning.sim.tickHz;
const seconds = Number(args.get('seconds') ?? 420);
const shots = Number(args.get('shots') ?? 3);
const camp = commanderOf(sim)?.camp;
const card = sim.world.report.camp;
if (!camp || !card) fail(`${name} has no camp to play a sitting against.`);
const world = sim.world;
const posts = world.camp.guards;
const you = player(sim.index);
if (!args.has('hurt')) delete you.health;
if (args.has('dead-vehicle')) for (const v of sim.index.of('vehicle')) if (v.vehicle.escape) v.vehicle.disabled = true;

// Where he is: on the best overview if the run starts him there, and then he fires at the posts it sees best.
const perch = bestOverview(world);
const onPerch = (you.body.x - perch.x) * (you.body.x - perch.x) + (you.body.z - perch.z) * (you.body.z - perch.z) < 25;
const seen = card.perches
  .find((p) => p.x === perch.x && p.z === perch.z)!
  .guards.map((v, i) => [v, i] as const)
  .filter(([v, i]) => v > 0.2 && !(args.has('spare-door') && posts[i]!.holdsDoor))
  .sort((p, q) => q[0] - p[0] || p[1] - q[1]) // the post's index breaks a tie
  .map(([, i]) => i);
const steps: Step[] = [{ at: 0.2, act: 'prone' }, { at: 3, act: 'scope' }];
if (onPerch) seen.slice(0, shots).forEach((post, i) => steps.push({ at: 8 + i * 6, act: 'fire', target: { post }, breath: 1.5 }));
const driver = new MarksmanDriver(steps);
const raw = scene.game.still(sim);

const at = (): string => `${String(Math.floor(sim.tick / hz / 60)).padStart(2)}:${String(Math.floor((sim.tick / hz) % 60)).padStart(2, '0')}`;
const say = (what: string): void => console.log(`  ${at()}  ${what}`);
const postOf = new Map(sim.guards.map((g) => [g.id, g.guard.spawn]));
const escape = sim.index.of('vehicle').find((v) => v.vehicle.escape);

console.log(`${scene.title} · ${name}${params ? ` ${params}` : ''}`);
console.log(`  built round: ${world.camp.crux ?? 'no one problem'} · it ${camp.protects ? (camp.answer === 'hold' ? 'holds him' : camp.answer === 'bolt' ? 'bolts with him' : 'waits for its relief') : 'runs him at the siren'} · ${sim.guards.length} men`);
console.log(
  onPerch
    ? `  he lies on the best overview and fires ${Math.min(shots, seen.length)} round(s), at: ${seen.slice(0, shots).map((i) => `${posts[i]!.role}${posts[i]!.holdsDoor ? ' (on the target’s door)' : ''}`).join(', ') || 'nobody'}${args.has('hurt') ? '' : ' · he can’t be hurt'}`
    : '  he isn’t on a perch: he stays where the run starts and does nothing',
);

let whistled = false;
let hunted = false;
let protection = '';
let hunting = '';
for (let k = 0; k < seconds * hz && sim.state.outcome.status === 'playing'; k++) {
  for (const e of sim.step(driver.next(sim, raw))) {
    if (e.type === 'shot' && e.source === sim.playerId) say('he fires');
    else if (e.type === 'death') {
      const post = posts[postOf.get(e.victim) ?? -1];
      say(e.victim === camp.objective?.target ? 'THE TARGET is down' : `a man is down${post ? `: ${post.role}${post.holdsDoor ? ', the man on the target’s door' : ''}` : ''}`);
    } else if (e.type === 'whistle' && !whistled) {
      whistled = true;
      say('the whistle');
    } else if (e.type === 'siren') say('the siren');
    else if (e.type === 'engine' && e.load === 'start') say(escape && e.source === escape.id ? 'his vehicle’s engine starts' : 'an engine starts: a truck on the road');
    else if (e.type === 'reinforce') say(`the relief is at the gate (${e.count} men)`);
    else if (e.type === 'order' && e.task === 'hunt' && !hunted) {
      hunted = true;
      say('a section is ordered out after him');
    } else if (e.type === 'hurt') say(`he’s hit (${e.hits})`);
  }
  // What the lab panel would say, when it changes: every ten seconds is often enough to follow.
  if (sim.tick % (10 * hz) !== 0) continue;
  const p = protectionOf(sim).replace(/\d+ s/g, '… s');
  if (p !== protection) say(`the target: ${protectionOf(sim)}`);
  protection = p;
  const h = huntOf(sim).replace(/\d+(\.\d+)? (m|s)/g, '… $2');
  if (h !== hunting && huntOf(sim) !== '') say(`the hunt: ${huntOf(sim)}`);
  hunting = h;
}
const o = sim.state.outcome;
console.log(o.status === 'playing' ? `  still going after ${seconds} s: nothing has ended it` : `  ENDS at ${at()}: ${o.status}, ${o.reason}`);
