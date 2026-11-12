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
import { huntOf, protectionOf } from '../lab/gauges';
import { closeTo, overviewEye } from '../lab/vantage';
import { MarksmanDriver, type Step } from '../sim/game/bots/marksman';
import { commanderOf } from '../sim/game/comms';
import { player } from '../sim/game/entities';
import { SCENES } from '../sim/game/scenes';
import { bestOverview } from '../sim/game/scenes/liveCamp';
import { placePlayer } from '../sim/game/setup';
import type { Simulation } from '../sim/game/sim';
import { EventLog } from '../sim/kernel/eventlog';
import { sceneTuning, startScene, type Scene } from '../sim/kernel/scene';
import { AWARENESS, BARKS, CUE_WORDS, cuesInMind, explainChain } from '../sim/perception';
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
const why = args.has('why');
const camp = commanderOf(sim)?.camp;
const card = sim.world.report.camp;
if (!camp || !card) fail(`${name} has no camp to play a sitting against.`);
const world = sim.world;
const posts = world.camp.guards;
const you = player(sim.index);
if (!args.has('hurt')) delete you.health;
if (args.has('dead-vehicle')) for (const v of sim.index.of('vehicle')) if (v.vehicle.escape) v.vehicle.disabled = true;
if (you.rifle && args.has('suppressed')) you.rifle.suppressed = true;
if (you.rifle && args.has('subsonic')) {
  if (!('subsonic' in sim.tuning.ballistics.loads)) fail('This build has no subsonic load.');
  you.rifle.load = 'subsonic';
}

// Who he fires at: the posts the best overview sees best, of the kind asked for.
const perch = bestOverview(world);
const want = args.get('at');
const fits = (i: number): boolean => {
  const post = posts[i]!;
  if (args.has('spare-door') && post.holdsDoor) return false;
  return want === undefined || (want === 'tower' ? post.elevated === true : want === 'door' ? post.holdsDoor === true : post.role === want);
};
const seen = card.perches
  .find((p) => p.x === perch.x && p.z === perch.z)!
  .guards.map((v, i) => [v, i] as const)
  .filter(([v, i]) => v > 0.2 && fits(i))
  .sort((p, q) => q[0] - p[0] || p[1] - q[1]) // the post's index breaks a tie
  .map(([, i]) => i);

// Where he is: on the best overview if the run starts him there, or as near the first man as he was asked to lie.
const from = args.has('from') ? Number(args.get('from')) : NaN;
let close = false;
if (!Number.isNaN(from) && seen.length > 0) {
  const g = sim.guards.find((e) => e.guard.spawn === seen[0])!;
  const head = { x: g.body.x, y: g.body.y + g.body.eyeHeight, z: g.body.z };
  const at = closeTo(sim, head, overviewEye(sim), from);
  if (!at) fail(`Nowhere ${from} m from that man has a clear line to him.`);
  placePlayer(sim, at.x, at.z, head.x - at.x, head.z - at.z);
  close = true;
}
const onPerch = (you.body.x - perch.x) * (you.body.x - perch.x) + (you.body.z - perch.z) * (you.body.z - perch.z) < 25;
const steps: Step[] = [{ at: 0.2, act: 'prone' }, { at: 3, act: 'scope' }];
// Equipment: the generator, or the camp's alarm boxes in turn, a round each.
const kit = want === 'generator' || want === 'box' ? (world.camp.devices ?? []).filter((d) => d.kind === (want === 'box' ? 'alarm' : 'generator')) : [];
if (kit.length > 0) kit.slice(0, shots).forEach((d, i) => steps.push({ at: 8 + i * 6, act: 'fire', target: { x: d.x, y: d.y, z: d.z }, breath: 1.5 }));
else if (onPerch || close) seen.slice(0, shots).forEach((post, i) => steps.push({ at: 8 + i * 6, act: 'fire', target: { post }, breath: 1.5 }));
const driver = new MarksmanDriver(steps);
const raw = scene.game.still(sim);

const at = (): string => `${String(Math.floor(sim.tick / hz / 60)).padStart(2)}:${String(Math.floor((sim.tick / hz) % 60)).padStart(2, '0')}`;
const say = (what: string): void => console.log(`  ${at()}  ${what}`);
const postOf = new Map(sim.guards.map((g) => [g.id, g.guard.spawn]));
const escape = sim.index.of('vehicle').find((v) => v.vehicle.escape);
const log = new EventLog();
/** A man by his post's role, so a line reads without the debug view. */
const who = (id: number): string => {
  if (id === sim.playerId) return 'he';
  if (id === commanderOf(sim)?.id) return 'the camp';
  const g = sim.guards.find((e) => e.id === id);
  const post = posts[g ? g.guard.spawn : (postOf.get(id) ?? -1)];
  return post ? `${post.role}${post.elevated ? ' (raised)' : ''} ${id}` : `entity ${id}`;
};
/** With --why: the chain of causes behind an event, a line each, from what was sensed to what was done. */
const because = (id: number): void => {
  if (!why) return;
  for (const line of explainChain(log.explain(id), who)) console.log(`           · ${line}`);
};
/** How many of the camp's men stand at each rung of the ladder. */
const census = (): string => {
  const n = new Map<string, number>();
  for (const g of sim.guards) if (g.senses && posts[g.guard.spawn]?.role !== 'target') n.set(g.senses.awareness.state, (n.get(g.senses.awareness.state) ?? 0) + 1);
  return AWARENESS.filter((s) => n.has(s)).map((s) => `${n.get(s)} ${s}`).join(', ');
};

console.log(`${scene.title} · ${name}${params ? ` ${params}` : ''}`);
console.log(`  built round: ${world.camp.crux ?? 'no one problem'} · it ${camp.protects ? (camp.answer === 'hold' ? 'holds him' : camp.answer === 'bolt' ? 'bolts with him' : 'waits for its relief') : 'runs him at the siren'} · ${sim.guards.length} men`);
const round = `${you.rifle?.suppressed ? 'suppressed ' : ''}${you.rifle?.load ?? ''}`;
console.log(
  kit.length > 0
    ? `  he lies on the best overview and fires ${Math.min(shots, kit.length)} ${round} round(s), at: ${want === 'box' ? 'an alarm box' : 'the generator'}${args.has('hurt') ? '' : ' · he can’t be hurt'}`
    : onPerch || close
    ? `  he lies ${close ? `${from} m from the first man` : 'on the best overview'} and fires ${Math.min(shots, seen.length)} ${round} round(s), at: ${seen.slice(0, shots).map((i) => `${posts[i]!.role}${posts[i]!.elevated ? ' (raised)' : ''}${posts[i]!.holdsDoor ? ' (on the target’s door)' : ''}`).join(', ') || 'nobody'}${args.has('hurt') ? '' : ' · he can’t be hurt'}`
    : '  he isn’t on a perch: he stays where the run starts and does nothing',
);

let whistled = false;
let hunted = false;
let protection = '';
let hunting = '';
let firstDown = -1;
const runners = new Set<number>();
const shouted = new Set<number>();
const sure = new Set<number>();
for (let k = 0; k < seconds * hz && sim.state.outcome.status === 'playing'; k++) {
  const events = sim.step(driver.next(sim, raw));
  log.add(events);
  for (const e of events) {
    if (e.type === 'shot' && e.source === sim.playerId) say('he fires');
    else if (e.type === 'death') {
      const post = posts[postOf.get(e.victim) ?? -1];
      if (firstDown < 0) firstDown = sim.tick;
      say(e.victim === camp.objective?.target ? 'THE TARGET is down' : `a man is down${post ? `: ${post.role}${post.elevated ? ' (raised)' : ''}${post.holdsDoor ? ', the man on the target’s door' : ''}` : ''}`);
    } else if (e.type === 'cry') say('he cries out as he falls: it wasn’t through the head');
    else if (e.type === 'whistle' && !whistled) {
      whistled = true;
      say('the whistle');
      because(e.id);
    } else if (e.type === 'siren') {
      say('the siren');
      because(e.id);
    } else if (e.type === 'act' && e.to === 'alarm' && !runners.has(e.source)) {
      runners.add(e.source);
      say(`${who(e.source)} runs for the alarm`);
      because(e.id);
    } else if (e.type === 'alarm') say(`${who(e.source)} throws the alarm: ${e.stage === 'raised' ? 'it sounds' : 'it’s dead'}`);
    else if (e.type === 'level') say(`the camp is ${e.to}, from ${e.from}`);
    else if (e.type === 'impact' && e.source === sim.playerId && e.what !== 'body') say(`his round strikes ${e.what === 'terrain' ? 'the ground' : 'something solid'}`);
    else if (e.type === 'sabotage') say(e.what === 'alarm' ? 'an alarm box is dead' : `the ${e.what} is out of action`);
    else if (e.type === 'checkin' && e.stage === 'silence') say(`a post doesn’t answer its check-in: ${posts[e.post]?.role ?? 'post'}`);
    else if (e.type === 'spotted' && e.what === 'body') say(`${who(e.source)} sees a body`);
    else if (e.type === 'bark' && BARKS[e.line]?.shout && !shouted.has(e.line)) {
      shouted.add(e.line);
      say(`${who(e.source)} shouts “${BARKS[e.line]!.text}”`);
      because(e.id);
    } else if (why && e.type === 'alert' && e.to === 'searching' && e.reason !== 'voice' && sure.size < 6 && !sure.has(e.source)) {
      // With --why: the first few men to take it for the real thing by their own senses, and on what.
      sure.add(e.source);
      // What he was going on: the cues of a shooting that reached him inside a few seconds of each other (perception/awareness.ts, `agree`).
      const senses = sim.guards.find((g) => g.id === e.source)?.senses;
      const cues = senses ? cuesInMind(senses.awareness, sim.tick, sim.tuning) : [];
      say(`${who(e.source)} is sure of it${cues.length ? `: ${cues.map((c) => CUE_WORDS[c]).join(' and ')}` : ''}`);
      because(e.id);
    } else if (e.type === 'engine' && e.load === 'start') say(escape && e.source === escape.id ? 'his vehicle’s engine starts' : 'an engine starts: a truck on the road');
    else if (e.type === 'reinforce') say(`the relief is at the gate (${e.count} men)`);
    else if (e.type === 'order' && e.task === 'hunt' && !hunted) {
      hunted = true;
      say('a section is ordered out after him');
    } else if (e.type === 'hurt') say(`he’s hit (${e.hits})`);
  }
  // How far the news has gone, five and twenty seconds after the first man fell.
  if (firstDown >= 0 && (sim.tick - firstDown === 5 * hz || sim.tick - firstDown === 20 * hz)) say(`the rest of the camp: ${census()}`);
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
