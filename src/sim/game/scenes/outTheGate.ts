import { navigatorOf, outsideWalls } from '../../brain';
import { compoundDrops, stimulus } from '../drops';
import type { InputFrame } from '../../kernel/input';
import type { Driver } from '../../kernel/scene';
import { WalkTo } from '../bots/person';
import { ViewDriver } from '../bots/playerView';
import { player } from '../entities';
import { leavingOf, type Leaving } from '../leaving';
import { placePlayer } from '../setup';
import type { Simulation } from '../sim';
import { parseSwitches, switchedOff, type CampSwitch } from '../switches';
import type { Scene } from '.';
import { liveCamp } from './liveCamp';

/**
 * Out of the gate (the owner, Nov 12): someone seen inside a camp leaves by an opening in its
 * wall, turns along the outside of it and stops a few metres on, where no post can see him.
 * "It was very, very rare for a guard to even step outside the door to look around or
 * continue a gunfight... the current reaction gives a slight impression of 'he walked out
 * that door, must be gone forever'." And what they'd expect: "a guard or two maybe continue
 * pursuit to fire from behind me as I escape", with nobody else leaving the target.
 *
 * Someone stands a little way inside an opening, in a guard's view, until a guard is sure of
 * him and the word has had a moment to spread. Then he runs out, turns along the wall and
 * stops. `plan=run` has him go on from there, straight away from the camp. `plan=fight` has
 * him stay and shoot whoever comes out by the opening, which is the other half of what the
 * owner asked for: "if I can shoot them down as they expose themselves outside of the camp,
 * then I get more of that sense of security because I took out the ones that did pursue,
 * and the rest are still defending within". What the scene asks is what comes after him:
 * that a man or two come out and set eyes on him again, and that no more than that leave
 * the walls, however many of them he puts down.
 *
 * It's the takedown's camp. He can't be hurt here, because the question is whether they
 * come, and a dead man can't be followed.
 */

export interface OutTheGateParams {
  seed: string;
  /** What he does once he's along the wall: stays there, runs on away from the camp, or stays and shoots whoever comes out after him. */
  plan: 'wall' | 'run' | 'fight';
  off: CampSwitch[];
}

export function parseOutTheGate(text: string | undefined): OutTheGateParams {
  const p: OutTheGateParams = { seed: 'TES-6931', plan: 'wall', off: [] };
  for (const part of (text ?? '').split('&')) {
    if (!part) continue;
    const [key, value] = part.split('=');
    if (key === 'seed' && value) p.seed = value;
    else if (key === 'plan' && (value === 'wall' || value === 'run' || value === 'fight')) p.plan = value;
    else if (key === 'off') p.off = parseSwitches(value ?? '');
    else throw new Error(`The out-the-gate scene doesn't know '${part}'`);
  }
  return p;
}

/**
 * He stays where he was seen until this many guards have him in sight, or for `LINGER`
 * seconds after the first is sure of him if a man with a rifle is among them, or for
 * `AT_MOST` whoever they are: when the owner did it, "many guards were aware of my presence
 * within the camp at once and actively watching me". A camp where only a worker ever saw him
 * is a different question.
 */
const WATCHERS = 3;
const LINGER = 5;
const AT_MOST = 20;

/** What the scene's driver does: stands until someone's sure of him, then runs out of the opening, along the wall, and stops (or runs on). */
class ShowAndLeave implements Driver<Simulation> {
  private sure = -1;
  private legs: WalkTo[] = [];
  private leg = 0;
  private driver: ViewDriver | null = null;

  /** `plan=fight`: when he last fired. */
  private fired = -Infinity;

  constructor(private readonly plan: OutTheGateParams['plan']) {}

  next(sim: Simulation, out: InputFrame): InputFrame {
    const m = leavingOf(sim.world, sim.tuning);
    if (!m) return out;
    if (this.sure < 0) {
      if (!sim.guards.some((g) => g.senses?.awareness.state === 'combat')) return out;
      this.sure = sim.tick;
    }
    if (this.legs.length === 0) {
      const watching = sim.guards.filter((g) => g.senses?.awareness.state === 'combat');
      const armed = watching.some((g) => sim.tuning.brain.roles[sim.world.camp.guards[g.guard.spawn]!.role].fight > 0);
      const waited = (sim.tick - this.sure) / sim.tuning.sim.tickHz;
      if (watching.length < WATCHERS && waited < (armed ? LINGER : AT_MOST)) return out;
    }
    if (this.legs.length === 0) {
      this.legs = [new WalkTo(m.out.x, m.out.z, 'stand', true), new WalkTo(m.hide.x, m.hide.z, 'stand', true)];
      if (this.plan === 'run') this.legs.push(new WalkTo(m.away.x, m.away.z, 'stand', true));
      this.driver = new ViewDriver(this.legs[0]!);
    }
    while (this.leg < this.legs.length && this.legs[this.leg]!.arrived) {
      this.leg++;
      if (this.leg < this.legs.length) this.driver = new ViewDriver(this.legs[this.leg]!);
    }
    if (this.leg < this.legs.length) return this.driver!.next(sim, out);
    out.commands = [];
    if (this.plan === 'fight') this.shoot(sim, m, out);
    return out;
  }

  /** At his place along the wall, a round every `EVERY` seconds at a man who has come out by the opening and is in his view: the nearest. */
  private shoot(sim: Simulation, m: Leaving, out: InputFrame): void {
    const hz = sim.tuning.sim.tickHz;
    if ((sim.tick - this.fired) / hz < EVERY) return;
    const you = player(sim.index).body;
    const nav = navigatorOf(sim.world, sim.tuning);
    const eye = { x: you.x, y: you.y + you.eyeHeight, z: you.z };
    let best: { x: number; y: number; z: number } | null = null;
    let least = Infinity;
    for (const g of sim.guards) {
      const b = g.body;
      if (!outsideWalls(sim.world, b.x, b.z) || (b.x - m.gate.x) * (b.x - m.gate.x) + (b.z - m.gate.z) * (b.z - m.gate.z) > (BY_GATE + 8) * (BY_GATE + 8)) continue;
      const chest = b.y + b.eyeHeight * 0.75;
      if (!nav.seesPoint(eye.x, eye.y, eye.z, b.x, chest, b.z)) continue;
      const d = (b.x - you.x) * (b.x - you.x) + (b.z - you.z) * (b.z - you.z);
      if (d < least) {
        least = d;
        best = { x: b.x, y: chest, z: b.z };
      }
    }
    if (!best) return;
    this.fired = sim.tick;
    out.commands = [stimulus('shot', best, eye)];
  }
}

/** Seconds between his rounds, with `plan=fight`: a bolt worked, and a man found in the sights. */
const EVERY = 1.6;

/** What a run has shown: ticks (−1 until it happens), and the men who did each thing. */
export interface GateSeen {
  /** A guard was sure of him; he crossed the wall's line; he reached his place along it. */
  sure: number;
  left: number;
  hidden: number;
  /** He found another way out than the opening he was put by: the run says nothing about that opening. */
  astray: boolean;
  /** How many of the camp were in combat or searching as he crossed. */
  aware: number;
  /** Men who were outside the walls already when he crossed: a patrol on its beat isn't anyone coming after him. */
  already: Set<number>;
  /** Men who came to the opening after he'd gone through it, and men who went out of the walls after him and stayed out a moment: one who turned back on the threshold didn't go. */
  came: Set<number>;
  went: Set<number>;
  /** Ticks each man has spent outside by the opening, and the tick the first of them stepped out. */
  outFor: Map<number, number>;
  outAt: number;
  cameAt: number;
  wentAt: number;
  /** A man who went out after him had him in sight; anyone at all did, once he was at his place. */
  found: number;
  seenAgain: number;
  /** Rounds the camp fired after he'd gone through, those of them fired by men who went out, and the most such men outside the walls at once. */
  rounds: number;
  roundsOut: number;
  most: number;
  /** The fewest men who fight and aren't on a tower left inside the walls. */
  home: number;
  /** Of the men who came out after him, those he put down (`plan=fight`), and the men who came out once two were down already. */
  down: Set<number>;
  late: Set<number>;
}

export function emptyGateSeen(): GateSeen {
  return { sure: -1, left: -1, hidden: -1, astray: false, aware: 0, already: new Set(), came: new Set(), went: new Set(), outFor: new Map(), outAt: -1, cameAt: -1, wentAt: -1, found: -1, seenAgain: -1, rounds: 0, roundsOut: 0, most: 0, home: Infinity, down: new Set(), late: new Set() };
}

/** Metres from the opening's middle that count as at it, and as having come out by it. */
const AT_GATE = 6;
const BY_GATE = 12;
/** Seconds outside that count as having gone out: less is a man who turned back on the threshold. */
const STAYED = 1.5;
/** Seconds from his crossing the wall by which a man has to be out after him for it to be a chase, and not the camp's search finding its way there a minute on. */
export const SOON = 30;

/** The scene's table: two camps, and on the first each thing he might do once he's out. */
export const OUT_THE_GATE_TABLE: readonly string[] = ['seed=TES-6931', 'seed=VOP-9546', 'seed=TES-6931&plan=run', 'seed=TES-6931&plan=fight'];

/** Takes one tick's events and state into what the run has shown. */
export function watchGate(sim: Simulation, events: ReturnType<Simulation['step']>, seen: GateSeen): void {
  const m = leavingOf(sim.world, sim.tuning);
  if (!m) return;
  const you = player(sim.index).body;
  const roles = sim.tuning.brain.roles;
  if (seen.sure < 0 && sim.guards.some((g) => g.senses?.awareness.state === 'combat')) seen.sure = sim.tick;
  if (seen.left < 0 && seen.sure >= 0 && outsideWalls(sim.world, you.x, you.z)) {
    seen.left = sim.tick;
    seen.aware = sim.guards.filter((g) => g.senses?.awareness.state === 'combat' || g.senses?.awareness.state === 'searching').length;
    for (const g of sim.guards) if (outsideWalls(sim.world, g.body.x, g.body.z)) seen.already.add(g.id);
    seen.astray = (you.x - m.gate.x) * (you.x - m.gate.x) + (you.z - m.gate.z) * (you.z - m.gate.z) > BY_GATE * BY_GATE;
  }
  if (seen.left >= 0 && seen.hidden < 0 && (you.x - m.hide.x) * (you.x - m.hide.x) + (you.z - m.hide.z) * (you.z - m.hide.z) < 4) seen.hidden = sim.tick;
  if (seen.left < 0) return;
  for (const e of events) {
    if (e.type === 'death' && seen.outFor.has(e.victim)) seen.down.add(e.victim);
    if (e.type !== 'shot' || e.source === sim.playerId) continue;
    seen.rounds++;
    if (seen.went.has(e.source)) seen.roundsOut++;
  }
  let outside = 0;
  let home = 0;
  for (const g of sim.guards) {
    const post = sim.world.camp.guards[g.guard.spawn]!;
    // The relief comes up the road from outside, and isn't anyone going after him.
    if (g.guard.reserve) continue;
    const out = outsideWalls(sim.world, g.body.x, g.body.z);
    const sees = g.senses?.percepts.some((q) => q.kind === 'sight' && q.tick === sim.tick) === true;
    if (sees && seen.seenAgain < 0 && seen.hidden >= 0) seen.seenAgain = sim.tick;
    // Out after him: outside the walls, by the opening he left by. A man who has taken a position outside the far wall is the firefight's, as he always was.
    if (out && !post.elevated && !seen.already.has(g.id) && (seen.went.has(g.id) || (g.body.x - m.gate.x) * (g.body.x - m.gate.x) + (g.body.z - m.gate.z) * (g.body.z - m.gate.z) <= BY_GATE * BY_GATE)) {
      const spent = (seen.outFor.get(g.id) ?? 0) + 1;
      seen.outFor.set(g.id, spent);
      if (seen.outAt < 0) seen.outAt = sim.tick;
      if (spent >= STAYED * sim.tuning.sim.tickHz) {
        outside++;
        if (!seen.went.has(g.id)) {
          seen.went.add(g.id);
          if (seen.wentAt < 0) seen.wentAt = sim.tick;
          if (seen.down.size >= 2) seen.late.add(g.id);
        }
      }
      if (sees && seen.found < 0) seen.found = sim.tick;
    } else if (!post.elevated && roles[post.role].fight > 0) home++;
    if (!seen.came.has(g.id) && (g.body.x - m.gate.x) * (g.body.x - m.gate.x) + (g.body.z - m.gate.z) * (g.body.z - m.gate.z) <= AT_GATE * AT_GATE) {
      seen.came.add(g.id);
      if (seen.cameAt < 0) seen.cameAt = sim.tick;
    }
  }
  if (outside > seen.most) seen.most = outside;
  if (home < seen.home) seen.home = home;
}

export function outTheGate(params?: string): Scene {
  const p = parseOutTheGate(params);
  const base = liveCamp(`seed=${p.seed}`);
  // What the run has shown so far: kept by the scene, and begun again by its setup.
  let seen = emptyGateSeen();
  return switchedOff(
    {
      ...base,
      name: 'out-the-gate',
      version: 1,
      params: `seed=${p.seed}${p.plan === 'wall' ? '' : `&plan=${p.plan}`}${p.off.length > 0 ? `&off=${p.off.join(',')}` : ''}`,
      title: `Out of the gate (${p.seed})`,
      description: 'Someone stands inside an opening in the camp’s wall until he is seen, then runs out, turns along the outside of the wall and stops where no post can see him. What comes after him?',
      // `plan=fight` fires his rounds as the compound simulator drops its own: from where he stands, at a place.
      systems: [...(base.systems ?? []), compoundDrops],
      setup: (sim) => {
        base.setup!(sim);
        seen = emptyGateSeen();
        const m = leavingOf(sim.world, sim.tuning);
        if (m) placePlayer(sim, m.show.x, m.show.z, m.faceX, m.faceZ);
        // The question is whether they come: he can't be hurt here. Running for the trees, he can: what it costs him is the question there.
        if (p.plan !== 'run') delete player(sim.index).health;
      },
      driver: () => new ShowAndLeave(p.plan),
      seconds: 120,
      playOn: true,
      expect: [
        {
          name: 'he is seen inside, and gets out and along the wall',
          during(sim, events) {
            watchGate(sim, events, seen);
          },
          after: (sim) =>
            !leavingOf(sim.world, sim.tuning)
              ? 'this camp has no opening with a wall to follow out of sight'
              : seen.sure < 0
                ? 'nobody was ever sure of him'
                : seen.left < 0
                  ? 'he never got out of the walls'
                  : seen.astray
                    ? 'he found another way out than the opening he stood by'
                    : p.plan !== 'run' && seen.hidden < 0
                    ? 'he never reached his place along the wall'
                    : undefined,
        },
        {
          name: p.plan === 'fight' ? 'someone comes out after him, soon' : 'someone comes out after him soon, and sets eyes on him',
          after: (sim) => {
            if (seen.left < 0 || seen.astray) return undefined;
            const hz = sim.tuning.sim.tickHz;
            if (seen.outAt < 0) return `nobody went out after him (${seen.came.size} came to the opening)`;
            if ((seen.outAt - seen.left) / hz > SOON) return `the first man out after him was ${((seen.outAt - seen.left) / hz).toFixed(0)} s behind him`;
            if (p.plan !== 'fight' && seen.found < 0) return `${seen.outFor.size} went out after him, and none had set eyes on him ${((sim.tick - seen.left) / hz).toFixed(0)} s on`;
            return undefined;
          },
        },
        {
          name: p.plan === 'fight' ? 'once two are down, nobody else comes out, and the camp keeps the rest' : 'a man or two go, and the camp keeps the rest',
          after: (sim) =>
            seen.most > 2
              ? `${seen.most} men were out after him at once`
              : seen.late.size > 0
                ? `${seen.late.size} more came out once two were down`
                : seen.home < sim.tuning.brain.hunt.keep
                  ? `only ${seen.home} fighting men were left inside`
                  : undefined,
        },
      ],
    },
    p.off,
  );
}
