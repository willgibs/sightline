import { dcos, dlog, dsin } from '../kernel/core/detmath';
import { Rng } from '../kernel/core/rng';
import { neutralInput, type InputFrame } from '../kernel/input';
import type { Driver } from '../kernel/scene';
import type { StimulusCommand } from '../kernel/commands';
import { Blocks } from '../kernel/world/colliders';
import { sightLine } from '../kernel/world/query';
import { stimulus, type StimulusName } from './drops';
import type { Simulation } from './sim';

/**
 * Attack scripts for the compound simulator (Lab F): the different ways a camp can be
 * attacked, as timed stimuli and no player at all. The camp's defence should hold up against
 * every one of them, which is what the flaw detectors (src/lab/flaws.ts) look for.
 *
 * A script is a test driver, so it may read the simulation to pick its moments. The camp
 * can't: it only ever gets the sound, the sight, the bullet or the body.
 */

/** How far off a person's shot is, radians, one standard deviation: good, from a rest, with range and wind judged by eye. */
const AIM_ERROR = 0.0008;
/** Seconds between a person's shots: finding the next man, ranging him, holding. */
const SHOT_GAP = 8;
/** How far up the body he aims, as a share of the eye's height: the chest. */
const CHEST = 0.75;

export interface AttackStep {
  at: number;
  make(sim: Simulation, rng: Rng): StimulusCommand | null;
}

interface Point {
  x: number;
  y: number;
  z: number;
}

/** What actually happened in a run: the truth a detector can hold the camp's reaction against. */
export interface Attacked {
  tick: number;
  what: StimulusName;
  from: Point;
  at: Point;
}

interface Perch {
  x: number;
  z: number;
  coverage: number;
}

const perchesOf = (sim: Simulation): Perch[] => [...(sim.world.report.camp!.perches as readonly Perch[])].sort((a, b) => b.coverage - a.coverage || a.x - b.x || a.z - b.z);

const proneEye = (sim: Simulation, p: { x: number; z: number }): Point => ({ x: p.x, y: sim.world.terrain.heightAt(p.x, p.z) + sim.tuning.bodies.player.eyeHeight.prone, z: p.z });

/** The perch best placed to fire on the camp, and the listed perch farthest round the camp from it: a second direction. */
function twoPerches(sim: Simulation): [Perch, Perch] {
  const list = perchesOf(sim);
  const a = list[0]!;
  const s = sim.world.camp.site;
  let other = a;
  let cos = 1;
  for (const p of list) {
    const c = ((a.x - s.x) * (p.x - s.x) + (a.z - s.z) * (p.z - s.z)) / (Math.sqrt((a.x - s.x) * (a.x - s.x) + (a.z - s.z) * (a.z - s.z)) * Math.sqrt((p.x - s.x) * (p.x - s.x) + (p.z - s.z) * (p.z - s.z)) || 1);
    if (c < cos) {
      cos = c;
      other = p;
    }
  }
  return [a, other];
}

/** One draw from a normal distribution with this standard deviation. */
function normal(rng: Rng, sigma: number): number {
  return sigma * Math.sqrt(-2 * dlog(Math.max(1e-12, rng.next()))) * dcos(2 * Math.PI * rng.next());
}

/**
 * A shot from a perch at the first guard in a clear line from it, at his chest and with a
 * person's error, or no shot at all: someone who can see nobody has nothing to shoot at.
 */
function shotAtSomeone(sim: Simulation, perch: Perch, what: StimulusName, rng: Rng): StimulusCommand | null {
  const from = proneEye(sim, perch);
  // Terrain and solids only: a body in the line is what he's aiming at. He has to see the
  // man, and the round has to be able to get there.
  const view = { world: sim.world, solids: sim.solids, bodies: [] };
  for (const g of sim.guards) {
    const y = g.body.y + g.body.eyeHeight * CHEST;
    if (!sightLine(view, from.x, from.y, from.z, g.body.x, y, g.body.z, Blocks.Sight | Blocks.Bullet)) continue;
    const dx = g.body.x - from.x;
    const dy = y - from.y;
    const dz = g.body.z - from.z;
    const off = AIM_ERROR * Math.sqrt(dx * dx + dy * dy + dz * dz);
    return stimulus(what, { x: g.body.x + normal(rng, off), y: y + normal(rng, off), z: g.body.z + normal(rng, off) }, from);
  }
  return null;
}

function shots(times: readonly number[], perch: (sim: Simulation) => Perch, what: StimulusName = 'shot'): AttackStep[] {
  return times.map((at) => ({ at, make: (sim, rng) => shotAtSomeone(sim, perch(sim), what, rng) }));
}

const first = (sim: Simulation): Perch => twoPerches(sim)[0];
const second = (sim: Simulation): Perch => twoPerches(sim)[1];

/** A point on the fence, by the angle round the camp. */
function aroundTheFence(sim: Simulation, turn: number): Point {
  const s = sim.world.camp.site;
  const r = sim.world.camp.fenceHalf + 12;
  const a = turn * 2 * Math.PI;
  const x = s.x + r * dcos(a);
  const z = s.z + r * dsin(a);
  return { x, y: sim.world.terrain.heightAt(x, z), z };
}

const volley = (from: number, n: number): number[] => Array.from({ length: n }, (_, k) => from + k * SHOT_GAP);

export const ATTACKS: Readonly<Record<string, AttackStep[]>> = {
  'one-shot': shots([12], first),
  sniper: shots(volley(12, 8), first),
  'suppressed-sniper': shots(volley(12, 8), first, 'suppressed-shot'),
  relocating: [...shots(volley(12, 3), first), ...shots(volley(50, 3), second), ...shots(volley(95, 3), first)],
  'two-fronts': [...shots(volley(12, 3), first), ...[20, 28, 36].map((at, k) => ({ at, make: (sim: Simulation) => stimulus('noise', aroundTheFence(sim, 0.3 + k * 0.1)) }))],
  noises: [0, 1, 2, 3, 4, 5].map((k) => ({ at: 12 + k * 12, make: (sim: Simulation) => stimulus('noise', aroundTheFence(sim, k / 6)) })),
  'silent-kills': [15, 40, 65].map((at) => ({
    at,
    make: (sim: Simulation) => {
      const g = sim.guards[Math.floor(sim.guards.length / 2)];
      return g ? stimulus('kill', { x: g.body.x, y: g.body.y, z: g.body.z }) : null;
    },
  })),
  sabotage: [
    {
      at: 10,
      make: (sim) => {
        const d = sim.world.camp.devices?.find((x) => x.kind === 'generator');
        return d ? stimulus('sabotage', { x: d.x, y: d.y, z: d.z }) : null;
      },
    },
    ...shots(volley(30, 3), first),
  ],
  quiet: [],
};

export class AttackDriver implements Driver<Simulation> {
  /** What was really done, and from where. */
  readonly truth: Attacked[] = [];
  private k = 0;
  private readonly steps: AttackStep[];
  private rng: Rng | null = null;

  constructor(name: string) {
    const steps = ATTACKS[name];
    if (!steps) throw new Error(`There's no attack called '${name}': there's ${Object.keys(ATTACKS).join(', ')}`);
    // By time, and in the order they're written for the same moment.
    this.steps = steps.map((step, k) => ({ step, k })).sort((a, b) => a.step.at - b.step.at || a.k - b.k).map((x) => x.step);
  }

  next(sim: Simulation, out: InputFrame): InputFrame {
    Object.assign(out, neutralInput(sim.player.yaw));
    const commands: StimulusCommand[] = [];
    const now = sim.tick / sim.tuning.sim.tickHz;
    while (this.k < this.steps.length && this.steps[this.k]!.at <= now) {
      this.rng ??= new Rng(sim.world.seed, 'attack');
      const c = this.steps[this.k++]!.make(sim, this.rng);
      if (!c) continue;
      commands.push(c);
      this.truth.push({ tick: sim.tick, what: (['noise', 'body', 'shot', 'suppressed-shot', 'kill', 'sabotage'] as const)[c.what]!, from: { x: c.fromX, y: c.fromY, z: c.fromZ }, at: { x: c.x, y: c.y, z: c.z } });
    }
    out.commands = commands;
    return out;
  }
}
