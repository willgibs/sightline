import { Rng } from '../../kernel/core/rng';
import type { InputFrame } from '../../kernel/input';
import type { Driver } from '../../kernel/scene';
import type { World } from '../../kernel/world/world';
import { defaultCampSpec } from '../../generation';
import { OverlookShooter } from '../bots/overlook';
import { Careless, ContactAndBreak, ShootAndCircle, ShootAndRelocate, ShootOnceAndLeave } from '../bots/person';
import { ViewDriver } from '../bots/playerView';
import { placePlayer } from '../setup';
import { parseSwitches, switchedOff, type CampSwitch } from '../switches';
import type { Simulation } from '../sim';
import type { Scene } from '.';
import { liveCamp, READINESS, type Readiness } from './liveCamp';
import { bestOverview } from './overlook';
import { takedownTuning } from './takedown';

/**
 * The bot ladder (Lab F, docs/camp-engine.md, section 4): the same live camp, played by a
 * plan, with the mission's own rule that you've won when the target is down and you've got
 * out. Every plan but one is limited to what a person can do (bots/person.ts):
 *
 *   careless   walks in standing up and shoots whoever he sees
 *   leave      from a perch, takes the clean moment on the target, then walks to the way out
 *   static     the perfect shooter on the best overview, who never moves (bots/overlook.ts): the upper limit of one perch
 *   relocate   shoots from one firing point, moves to the next after each engagement, and leaves once the target's down
 *   circle     a few rounds from a perch, then round the outside of the base shooting each man as he comes into view
 *   contact    round the outside until a stop shows him someone, a shot, then a run on out of sight to watch the way he came
 *
 * `circle` and `contact` aren't plans to win by: they don't leave, so they aren't on the
 * ladder's tally. They're the owner's complaints, from the takedown and from walking into a
 * camp: `npm run experiment -- circling` holds a camp's shape against the first, and
 * `-- firefight` holds what its men do against both. `ready=alert` plays any of them against
 * the takedown's camp.
 *
 * They all start on their firing point. The walk in is a separate question, and someone
 * who has found a perch has had the time to.
 */

export const LADDER_PLANS = ['careless', 'leave', 'static', 'relocate'] as const;
export type LadderPlan = (typeof LADDER_PLANS)[number];
type AnyPlan = LadderPlan | 'circle' | 'contact';

export interface LadderParams {
  seed: string;
  plan: AnyPlan;
  off: CampSwitch[];
  ready: Readiness;
}

export function parseLadder(text: string | undefined): LadderParams {
  const p: LadderParams = { seed: 'LEB-2534', plan: 'careless', off: [], ready: 'relaxed' };
  for (const part of (text ?? '').split('&')) {
    if (!part) continue;
    const [key, value] = part.split('=');
    if (key === 'seed' && value) p.seed = value;
    else if (key === 'plan' && ([...LADDER_PLANS, 'circle', 'contact'] as readonly string[]).includes(value ?? '')) p.plan = value as AnyPlan;
    else if (key === 'off') p.off = parseSwitches(value ?? '');
    else if (key === 'ready' && (READINESS as readonly string[]).includes(value ?? '')) p.ready = value as Readiness;
    else throw new Error(`The ladder doesn't know '${part}'`);
  }
  return p;
}

/** The perch that sees the target for longest. */
function bestOnTarget(world: World): { x: number; z: number } {
  return [...world.report.camp!.perches].sort((a, b) => b.target - a.target || b.coverage - a.coverage || a.x - b.x || a.z - b.z)[0]!; // the coordinates break a tie
}

/** Firing points in the order he'd use them: from the first, each time the nearest not yet used that's a real move away. */
function firingPoints(world: World, first: { x: number; z: number }): Array<{ x: number; z: number }> {
  const least = 60;
  const route = [first];
  const left = [...world.report.camp!.perches];
  while (route.length < 6) {
    const at = route[route.length - 1]!;
    let best = -1;
    let bestD = Infinity;
    for (let k = 0; k < left.length; k++) {
      const p = left[k]!;
      if (route.some((q) => (q.x - p.x) * (q.x - p.x) + (q.z - p.z) * (q.z - p.z) < least * least)) continue;
      const d = (at.x - p.x) * (at.x - p.x) + (at.z - p.z) * (at.z - p.z);
      if (d < bestD || (d === bestD && best >= 0 && (p.x < left[best]!.x || (p.x === left[best]!.x && p.z < left[best]!.z)))) {
        bestD = d;
        best = k;
      }
    }
    if (best < 0) break;
    route.push(left[best]!);
    left.splice(best, 1);
  }
  return route;
}

/** The perches best placed to see the target, well apart, the best first. */
function onTargetPerches(world: World): Array<{ x: number; z: number }> {
  const least = 50;
  const sorted = [...world.report.camp!.perches].sort((a, b) => b.target - a.target || b.coverage - a.coverage || a.x - b.x || a.z - b.z); // the coordinates break a tie
  const out: Array<{ x: number; z: number }> = [];
  for (const p of sorted) {
    if (out.length >= 5) break;
    if (!out.some((q) => (q.x - p.x) * (q.x - p.x) + (q.z - p.z) * (q.z - p.z) < least * least)) out.push(p);
  }
  return out;
}

/** Where a plan starts. */
function startOf(plan: AnyPlan, world: World): { x: number; z: number } {
  if (plan === 'contact') return ringAround(world, bestOverview(world))[0]!;
  return plan === 'static' || plan === 'careless' || plan === 'circle' ? bestOverview(world) : bestOnTarget(world);
}

/** How far outside the plot's edge the walk round goes, metres: the flat field just outside the compound. */
const RING_OFF = 25;
/** How far apart the stops on it are, metres. */
const RING_EVERY = 15;

/**
 * The outside of the base as someone on foot would walk it: a loop round the plot, `off`
 * metres out from its edge, a stop every `every` metres, beginning at the stop nearest `from`.
 */
export function ringAround(world: World, from: { x: number; z: number }, off = RING_OFF, every = RING_EVERY): Array<{ x: number; z: number }> {
  const L = world.camp.layout!;
  const s = world.camp.site;
  const A = L.halfA + off;
  const B = L.halfB + off;
  const corners = [
    [A, B],
    [-A, B],
    [-A, -B],
    [A, -B],
  ] as const;
  const ring: Array<{ x: number; z: number }> = [];
  corners.forEach(([a0, b0], k) => {
    const [a1, b1] = corners[(k + 1) % 4]!;
    const n = Math.max(1, Math.round((Math.abs(a1 - a0) + Math.abs(b1 - b0)) / every));
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const b = b0 + ((b1 - b0) * i) / n;
      ring.push({ x: s.x + L.ux * a + L.vx * b, z: s.z + L.uz * a + L.vz * b });
    }
  });
  let first = 0;
  let nearest = Infinity;
  ring.forEach((p, k) => {
    const d = (p.x - from.x) * (p.x - from.x) + (p.z - from.z) * (p.z - from.z);
    if (d < nearest) {
      nearest = d;
      first = k;
    }
  });
  return [...ring.slice(first), ...ring.slice(0, first)];
}

/** The `circle` plan's bot, for this simulation: built here so an experiment can see when it has been all the way round. */
export function circleOf(sim: Simulation): ShootAndCircle {
  const world = sim.world;
  const site = { x: world.camp.site.x, z: world.camp.site.z };
  const at = startOf('circle', world);
  return new ShootAndCircle(new Rng(`${world.seed}/dice${sim.tuning.sim.dice}`, 'person/circle'), site, ringAround(world, at));
}

/** The `contact` plan's bot, for this simulation: built here so an experiment can see when he breaks away. */
export function contactOf(sim: Simulation): ContactAndBreak {
  const world = sim.world;
  const site = { x: world.camp.site.x, z: world.camp.site.z };
  return new ContactAndBreak(new Rng(`${world.seed}/dice${sim.tuning.sim.dice}`, 'person/contact'), site, ringAround(world, bestOverview(world)));
}

/** Makes the plan's bot when the run starts, from the simulation it finds itself in. */
class PlanDriver implements Driver<Simulation> {
  private inner: Driver<Simulation> | null = null;

  constructor(private readonly plan: AnyPlan) {}

  next(sim: Simulation, out: InputFrame): InputFrame {
    this.inner ??= this.make(sim);
    return this.inner.next(sim, out);
  }

  private make(sim: Simulation): Driver<Simulation> {
    const world = sim.world;
    const site = { x: world.camp.site.x, z: world.camp.site.z };
    // A bot has its own stream, and another roll of the dice gives it other hands too.
    const rng = new Rng(`${world.seed}/dice${sim.tuning.sim.dice}`, `person/${this.plan}`);
    if (this.plan === 'circle') return new ViewDriver(circleOf(sim));
    if (this.plan === 'contact') return new ViewDriver(contactOf(sim));
    if (this.plan === 'static') return new OverlookShooter(5);
    if (this.plan === 'careless') return new ViewDriver(new Careless(rng, site));
    if (this.plan === 'leave') return new ViewDriver(new ShootOnceAndLeave(rng, site, onTargetPerches(world)));
    return new ViewDriver(new ShootAndRelocate(rng, site, firingPoints(world, startOf('relocate', world))));
  }
}

export function ladder(params?: string): Scene {
  const p = parseLadder(params);
  const base = liveCamp(`seed=${p.seed}&difficulty=${defaultCampSpec().difficulty}${p.ready !== 'relaxed' ? `&ready=${p.ready}` : ''}`);
  return switchedOff(
    {
      ...base,
      name: 'ladder',
      version: 1,
      params: `seed=${p.seed}&plan=${p.plan}${p.off.length > 0 ? `&off=${p.off.join(',')}` : ''}${p.ready !== 'relaxed' ? `&ready=${p.ready}` : ''}`,
      ...(p.ready === 'alert' ? { tune: takedownTuning } : {}),
      title: `The ladder: ${p.plan} (${p.seed})`,
      description: 'A live camp played by one plan of the bot ladder, with the mission\'s own rule: the target down, and you out.',
      setup: (sim) => {
        base.setup!(sim);
        const at = startOf(p.plan, sim.world);
        const site = sim.world.camp.site;
        placePlayer(sim, at.x, at.z, site.x - at.x, site.z - at.z);
      },
      driver: () => new PlanDriver(p.plan),
      // Long enough to walk out from anywhere. The perfect shooter never leaves, so he stops when he's had his chance.
      seconds: p.plan === 'static' ? 300 : 1200,
      expect: [
        {
          name: 'the run stays a run: the whole camp is awake, and the player is where the plan put him',
          after: (sim) => (sim.guards.some((g) => !g.brain) ? 'a guard has no brain' : undefined),
        },
      ],
    },
    p.off,
  );
}
