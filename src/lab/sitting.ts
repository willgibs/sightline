/**
 * A sitting's link, played headless as the page plays it: the scene and parameters from
 * its address, under the mission's rules, by a scripted person doing roughly what its
 * steps ask, for as long as the sitting takes. It says what the camp did and when, and
 * when and why the run ended: in words, a line at a time (`npm run sitting`,
 * src/headless/sitting.ts, which has the options), and as numbers (a `Reading`, which the
 * sittings bench takes for every sitting the plan links to: experiments/sittings.ts).
 *
 * A sitting costs the owner's time, and the scene a number was measured on isn't always
 * the scene a person plays: what ends a run is the difference. On Nov 11 the hunt's
 * sitting went on the desk on a camp that drives its target away two and a half minutes
 * after a loud shot. That ended the run a minute before the hunters reached the shooter,
 * and the bench hadn't said so, because its scene has no rule to end it. And playing the
 * target's answer this way found its getaway hanging on the one guard a perch sees best.
 *
 * He is a marksman lying on the camp's best overview, which is where `perch=1` starts a
 * run. A link that starts at the valley's edge is played by a man who stays there and does
 * nothing: this says how the run goes when nobody troubles the camp, and no more.
 *
 * It reads a simulation and steers only its player, as a person at the page would; the
 * numbers come from the same events as the words, so the two can't tell different stories.
 */
import type { Tuning } from '../config/tuning';
import { alertRung } from '../sim/brain';
import { MarksmanDriver, type Step } from '../sim/game/bots/marksman';
import { commanderOf } from '../sim/game/comms';
import { player } from '../sim/game/entities';
import { SCENES } from '../sim/game/scenes';
import { bestOverview } from '../sim/game/scenes/liveCamp';
import { placePlayer } from '../sim/game/setup';
import type { Simulation } from '../sim/game/sim';
import { EventLog } from '../sim/kernel/eventlog';
import { sceneTuning, startScene, type Scene } from '../sim/kernel/scene';
import type { Outcome } from '../sim/kernel/state';
import { AWARENESS, BARKS, CUE_WORDS, cuesInMind, explainChain, rung } from '../sim/perception';
import { huntOf, protectionOf } from './gauges';
import { closeTo, overviewEye } from './vantage';

/** What the marksman does, and for how long: the options of `npm run sitting`. */
export interface Marksman {
  /** Rounds he fires, six seconds apart, at whoever the perch sees best (0: he only watches). */
  shots: number;
  /** What he fires at: `tower`, `door`, a role, or `generator` or `box`; whoever the perch sees best if not given. */
  at?: string;
  /** The suppressor is fitted. */
  suppressed?: boolean;
  /** The subsonic load is in the rifle. */
  subsonic?: boolean;
  /** He lies this many metres from the first man he fires at, with a clear line, and not on the overview. */
  from?: number;
  /** He never shoots a man on the target's door. */
  spareDoor?: boolean;
  /** How long to play, seconds. */
  seconds: number;
  /** He can be shot. By default he can't, so the run shows what the camp does and not how long he lasts. */
  hurt?: boolean;
  /** The target's vehicle is sabotaged before the first shot. */
  deadVehicle?: boolean;
  /** Each step the camp takes, back to what a man sensed. */
  why?: boolean;
}

/** A sitting as its link is played when nothing else is asked: three rounds, and seven minutes. */
export const AS_LINKED: Marksman = { shots: 3, seconds: 420 };

/** The scene a sitting's link plays, and its parameters. */
export interface SceneLink {
  scene: string;
  params: string;
}

/**
 * The scene and parameters in a link: the deployment's address, or the part after it as
 * the plan writes it (`?scene=takedown&params=seed=LEB-2534%26perch=1&lab`). The rest of
 * the address (`&lab`) is the page's. Null if it names no scene.
 */
export function sceneOfLink(link: string): SceneLink | null {
  // Only the query matters, so any base will do for a link that starts with it.
  const query = new URL(link, 'https://sightline.invalid/').searchParams;
  const scene = query.get('scene');
  return scene ? { scene, params: query.get('params') ?? '' } : null;
}

/** A link that can't be played as a sitting, and why, in words `npm run sitting` prints. */
export class Unplayable extends Error {}

/** How a run ended, by its outcome's reason (game/combat.ts, `campRules`): a reading's `why` is the index here, or the length of the list for a reason it doesn't know. */
export const ENDINGS = ['still going', 'the target is down', 'the target got away', 'the target is down, and you got out', 'shot dead by the camp'] as const;

function endingOf(o: Outcome): number {
  if (o.status === 'playing') return 0;
  const k = ENDINGS.findIndex((e, i) => i > 0 && (o.reason === e || o.reason.startsWith(`${e}:`)));
  return k < 0 ? ENDINGS.length : k;
}

/**
 * What a sitting showed, as numbers. Times are seconds from the start, as the clock on the
 * lines reads; a time is NaN for what never happened, and so is a distance never measured.
 */
export interface Reading {
  /** The camp's men, as the run starts. */
  men: number;
  /** Rounds he was set to fire, and rounds he fired; of those, rounds that struck the ground or something solid. */
  rounds: number;
  shots: number;
  missed: number;
  /** Men down, not counting the target; the first of anyone to fall; men who cried out as they fell; the target down. */
  down: number;
  firstDown: number;
  cries: number;
  target: number;
  /** The whistle; the first man to run for the alarm, and how many ran; the siren. */
  whistle: number;
  ran: number;
  runners: number;
  siren: number;
  /** The camp's highest level: 0 calm, 1 uneasy, 2 alert, 3 lockdown (brain/camp.ts). */
  level: number;
  /** Men of the rest sure of it (searching or more), 5 s and 20 s after the first man fell. */
  sure5: number;
  sure20: number;
  /** The first man to see a body; how many lines were shouted; the first post to miss its check-in. */
  body: number;
  shouts: number;
  silent: number;
  /** His vehicle's engine started; the relief at the gate, and its men. */
  engine: number;
  relief: number;
  reliefMen: number;
  /** The camp first placed him, and how far off, metres. */
  placed: number;
  placedOff: number;
  /** A section ordered out after him; the first man to set off after him (to push or hunt); the nearest a man sent after him came, metres. */
  hunt: number;
  after: number;
  nearest: number;
  /** When the run ended, and how (ENDINGS). */
  end: number;
  why: number;
}

/**
 * Plays a sitting's link: `print` takes each line `npm run sitting` prints, in order.
 * Throws `Unplayable` before playing anything if the link can't be played as a sitting.
 */
export function playSitting(link: SceneLink, how: Marksman, tuning: Tuning, print: (line: string) => void = () => {}): Reading {
  const { scene: name, params } = link;
  const make = SCENES[name];
  if (!make) throw new Unplayable(`No scene called ${name}. Scenes: ${Object.keys(SCENES).join(', ')}`);
  const scene = make(params || undefined) as Scene<Simulation>;
  const sim = startScene(scene, sceneTuning(scene, tuning));
  const hz = sim.tuning.sim.tickHz;
  const { seconds, shots } = how;
  const why = how.why === true;
  const camp = commanderOf(sim)?.camp;
  const card = sim.world.report.camp;
  if (!camp || !card) throw new Unplayable(`${name} has no camp to play a sitting against.`);
  const world = sim.world;
  const posts = world.camp.guards;
  const you = player(sim.index);
  if (!how.hurt) delete you.health;
  if (how.deadVehicle) for (const v of sim.index.of('vehicle')) if (v.vehicle.escape) v.vehicle.disabled = true;
  if (you.rifle && how.suppressed) you.rifle.suppressed = true;
  if (you.rifle && how.subsonic) {
    if (!('subsonic' in sim.tuning.ballistics.loads)) throw new Unplayable('This build has no subsonic load.');
    you.rifle.load = 'subsonic';
  }

  // Who he fires at: the posts the best overview sees best, of the kind asked for.
  const perch = bestOverview(world);
  const want = how.at;
  const fits = (i: number): boolean => {
    const post = posts[i]!;
    if (how.spareDoor && post.holdsDoor) return false;
    return want === undefined || (want === 'tower' ? post.elevated === true : want === 'door' ? post.holdsDoor === true : post.role === want);
  };
  const seen = card.perches
    .find((p) => p.x === perch.x && p.z === perch.z)!
    .guards.map((v, i) => [v, i] as const)
    .filter(([v, i]) => v > 0.2 && fits(i))
    .sort((p, q) => q[0] - p[0] || p[1] - q[1]) // the post's index breaks a tie
    .map(([, i]) => i);

  // Where he is: on the best overview if the run starts him there, or as near the first man as he was asked to lie.
  const from = how.from ?? NaN;
  let close = false;
  if (!Number.isNaN(from) && seen.length > 0) {
    const g = sim.guards.find((e) => e.guard.spawn === seen[0])!;
    const head = { x: g.body.x, y: g.body.y + g.body.eyeHeight, z: g.body.z };
    const at = closeTo(sim, head, overviewEye(sim), from);
    if (!at) throw new Unplayable(`Nowhere ${from} m from that man has a clear line to him.`);
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
  const say = (what: string): void => print(`  ${at()}  ${what}`);
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
    for (const line of explainChain(log.explain(id), who)) print(`           · ${line}`);
  };
  /** The camp's men but the target, by the rung of the ladder each stands at. */
  const rungs = (): Map<string, number> => {
    const n = new Map<string, number>();
    for (const g of sim.guards) if (g.senses && posts[g.guard.spawn]?.role !== 'target') n.set(g.senses.awareness.state, (n.get(g.senses.awareness.state) ?? 0) + 1);
    return n;
  };
  /** How many of the camp's men stand at each rung of the ladder. */
  const census = (n: Map<string, number>): string => AWARENESS.filter((s) => n.has(s)).map((s) => `${n.get(s)} ${s}`).join(', ');
  const sure = (n: Map<string, number>): number => AWARENESS.filter((s) => rung(s) >= rung('searching')).reduce((k, s) => k + (n.get(s) ?? 0), 0);

  print(`${scene.title} · ${name}${params ? ` ${params}` : ''}`);
  print(`  built round: ${world.camp.crux ?? 'no one problem'} · it ${camp.protects ? (camp.answer === 'hold' ? 'holds him' : camp.answer === 'bolt' ? 'bolts with him' : 'waits for its relief') : 'runs him at the siren'} · ${sim.guards.length} men`);
  const round = `${you.rifle?.suppressed ? 'suppressed ' : ''}${you.rifle?.load ?? ''}`;
  print(
    kit.length > 0
      ? `  he lies on the best overview and fires ${Math.min(shots, kit.length)} ${round} round(s), at: ${want === 'box' ? 'an alarm box' : 'the generator'}${how.hurt ? '' : ' · he can’t be hurt'}`
      : onPerch || close
        ? `  he lies ${close ? `${from} m from the first man` : 'on the best overview'} and fires ${Math.min(shots, seen.length)} ${round} round(s), at: ${seen.slice(0, shots).map((i) => `${posts[i]!.role}${posts[i]!.elevated ? ' (raised)' : ''}${posts[i]!.holdsDoor ? ' (on the target’s door)' : ''}`).join(', ') || 'nobody'}${how.hurt ? '' : ' · he can’t be hurt'}`
        : '  he isn’t on a perch: he stays where the run starts and does nothing',
  );

  const r: Reading = {
    men: sim.guards.length,
    rounds: steps.filter((s) => s.act === 'fire').length,
    shots: 0,
    missed: 0,
    down: 0,
    firstDown: NaN,
    cries: 0,
    target: NaN,
    whistle: NaN,
    ran: NaN,
    runners: 0,
    siren: NaN,
    level: alertRung(camp.level),
    sure5: NaN,
    sure20: NaN,
    body: NaN,
    shouts: 0,
    silent: NaN,
    engine: NaN,
    relief: NaN,
    reliefMen: 0,
    placed: NaN,
    placedOff: NaN,
    hunt: NaN,
    after: NaN,
    nearest: Infinity,
    end: NaN,
    why: 0,
  };
  /** Now, as a reading's times are kept; and the first time of a thing, kept. */
  const now = (): number => sim.tick / hz;
  const first = (t: number): number => (Number.isNaN(t) ? now() : t);

  let whistled = false;
  let hunted = false;
  let protection = '';
  let hunting = '';
  let firstDown = -1;
  const runners = new Set<number>();
  const shouted = new Set<number>();
  const sureOf = new Set<number>();
  for (let k = 0; k < seconds * hz && sim.state.outcome.status === 'playing'; k++) {
    const events = sim.step(driver.next(sim, raw));
    // The log is only for the chains --why prints.
    if (why) log.add(events);
    for (const e of events) {
      // Not a line of its own: the first of the camp's men to set off after him, to fight his way to him or to hunt him.
      if (e.type === 'act' && (e.to === 'push' || e.to === 'hunt')) r.after = first(r.after);
      if (e.type === 'shot' && e.source === sim.playerId) {
        r.shots++;
        say('he fires');
      } else if (e.type === 'death') {
        const post = posts[postOf.get(e.victim) ?? -1];
        if (firstDown < 0) firstDown = sim.tick;
        r.firstDown = first(r.firstDown);
        if (e.victim === camp.objective?.target) r.target = first(r.target);
        else r.down++;
        say(e.victim === camp.objective?.target ? 'THE TARGET is down' : `a man is down${post ? `: ${post.role}${post.elevated ? ' (raised)' : ''}${post.holdsDoor ? ', the man on the target’s door' : ''}` : ''}`);
      } else if (e.type === 'cry') {
        r.cries++;
        say('he cries out as he falls: it wasn’t through the head');
      } else if (e.type === 'whistle' && !whistled) {
        whistled = true;
        r.whistle = now();
        say('the whistle');
        because(e.id);
      } else if (e.type === 'siren') {
        r.siren = first(r.siren);
        say('the siren');
        because(e.id);
      } else if (e.type === 'act' && e.to === 'alarm' && !runners.has(e.source)) {
        runners.add(e.source);
        r.ran = first(r.ran);
        r.runners = runners.size;
        say(`${who(e.source)} runs for the alarm`);
        because(e.id);
      } else if (e.type === 'alarm') say(`${who(e.source)} throws the alarm: ${e.stage === 'raised' ? 'it sounds' : 'it’s dead'}`);
      else if (e.type === 'level') {
        r.level = Math.max(r.level, alertRung(e.to));
        say(`the camp is ${e.to}, from ${e.from}`);
      } else if (e.type === 'impact' && e.source === sim.playerId && e.what !== 'body') {
        r.missed++;
        say(`his round strikes ${e.what === 'terrain' ? 'the ground' : 'something solid'}`);
      } else if (e.type === 'sabotage') say(e.what === 'alarm' ? 'an alarm box is dead' : `the ${e.what} is out of action`);
      else if (e.type === 'checkin' && e.stage === 'silence') {
        r.silent = first(r.silent);
        say(`a post doesn’t answer its check-in: ${posts[e.post]?.role ?? 'post'}`);
      } else if (e.type === 'spotted' && e.what === 'body') {
        r.body = first(r.body);
        say(`${who(e.source)} sees a body`);
      } else if (e.type === 'bark' && BARKS[e.line]?.shout && !shouted.has(e.line)) {
        shouted.add(e.line);
        r.shouts = shouted.size;
        say(`${who(e.source)} shouts “${BARKS[e.line]!.text}”`);
        because(e.id);
      } else if (why && e.type === 'alert' && e.to === 'searching' && e.reason !== 'voice' && sureOf.size < 6 && !sureOf.has(e.source)) {
        // With --why: the first few men to take it for the real thing by their own senses, and on what.
        sureOf.add(e.source);
        // What he was going on: the cues of a shooting that reached him inside a few seconds of each other (perception/awareness.ts, `agree`).
        const senses = sim.guards.find((g) => g.id === e.source)?.senses;
        const cues = senses ? cuesInMind(senses.awareness, sim.tick, sim.tuning) : [];
        say(`${who(e.source)} is sure of it${cues.length ? `: ${cues.map((c) => CUE_WORDS[c]).join(' and ')}` : ''}`);
        because(e.id);
      } else if (e.type === 'engine' && e.load === 'start') {
        if (escape && e.source === escape.id) r.engine = first(r.engine);
        say(escape && e.source === escape.id ? 'his vehicle’s engine starts' : 'an engine starts: a truck on the road');
      } else if (e.type === 'reinforce') {
        r.relief = first(r.relief);
        r.reliefMen += e.count;
        say(`the relief is at the gate (${e.count} men)`);
      } else if (e.type === 'order' && e.task === 'hunt' && !hunted) {
        hunted = true;
        r.hunt = now();
        say('a section is ordered out after him');
      } else if (e.type === 'hurt') say(`he’s hit (${e.hits})`);
    }
    // Where the camp has him, and how near the men it sent after him have come: the numbers the hunt's line shows.
    const c = commanderOf(sim)?.camp;
    if (c) {
      const him = sim.player;
      if (c.threat && Number.isNaN(r.placed)) {
        r.placed = now();
        r.placedOff = Math.sqrt((c.threat.x - him.x) * (c.threat.x - him.x) + (c.threat.z - him.z) * (c.threat.z - him.z));
      }
      for (const s of c.sections)
        for (const id of s.men) {
          const g = sim.guards.find((x) => x.id === id);
          if (g) r.nearest = Math.min(r.nearest, Math.sqrt((g.body.x - him.x) * (g.body.x - him.x) + (g.body.z - him.z) * (g.body.z - him.z)));
        }
    }
    // How far the news has gone, five and twenty seconds after the first man fell.
    if (firstDown >= 0 && (sim.tick - firstDown === 5 * hz || sim.tick - firstDown === 20 * hz)) {
      const n = rungs();
      if (sim.tick - firstDown === 5 * hz) r.sure5 = sure(n);
      else r.sure20 = sure(n);
      say(`the rest of the camp: ${census(n)}`);
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
  print(o.status === 'playing' ? `  still going after ${seconds} s: nothing has ended it` : `  ENDS at ${at()}: ${o.status}, ${o.reason}`);
  if (r.nearest === Infinity) r.nearest = NaN;
  r.end = o.status === 'playing' ? NaN : now();
  r.why = endingOf(o);
  return r;
}
