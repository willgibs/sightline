import { defaultTuning } from '../../config/tuning';
import { InvariantWatch, bodyShape, createBody, eyeOf } from '../body';
import { generateWorld } from '../generation';
import type { LayerName } from '../lanes';
import { LAYERS } from '../lanes';
import { Hasher } from '../kernel/core/hash';
import { neutralInput } from '../kernel/input';
import { missionSpec } from '../kernel/mission';
import type { WorkCounts } from '../kernel/work';
import { ChaosBot } from './bots/chaos';
import { WanderBot } from './bots/wander';
import { PINNED_RUNS, behaviourInto } from './runs';
import { Simulation } from './sim';
import { Acoustics, SEED_LAW, SIGHT_LAW, crackHeard, emptyHeard, foliageOf, sweepSight, type CrackHeard, type FlightPoint } from '../perception';
import { datan2, dexp } from '../kernel/core/detmath';
import { air, defaultEnv } from '../kernel/env';
import { Rng } from '../kernel/core/rng';
import { runScene } from '../kernel/scene';
import { labWorld } from './scenes/perceptionLab';
import { arenaWorld } from './scenes/movementLab';
import { Blocks } from '../kernel/world/colliders';
import { Solids } from '../kernel/world/solids';
import { sightLine, type QueryView } from '../kernel/world/query';
import { emptyShape } from '../kernel/world/shape';
import { SIGHT_TABLE, sightScenario } from './scenes/sightScenario';

/**
 * A bench for every lane (docs/foundation-shape.md): where "better" is measured instead
 * of claimed. A lane's bench is
 * - its pinned runs (runs.ts), whose fingerprints are golden (golden.ts), so a change
 *   shows which lane moved;
 * - the work each system does in them (kernel/work.ts): rays, grid nodes and bodies,
 *   deterministic and pinned, which turns rule 18's budgets into numbers;
 * - its quality metrics, deterministic numbers that say how good the lane is.
 *
 * Work and metrics are pinned in benchGolden.ts, which `npm run bench -- --write`
 * rewrites; review its diff as you would a moved golden. `npm run explain` prints both
 * beside every moved fingerprint. A lab improves its lane against its bench, and adds to
 * it: lab A its detection times, lab B its reticle error, lab E its search cycles.
 */

export interface Bench {
  /** What the bench measures, in words. */
  readonly about: string;
  /** The lane's quality metrics, by name: deterministic, so they can be pinned. */
  metrics(): Record<string, number>;
}

/** Each valley is played by both bots for a minute while every body's promises are checked. */
const BODY_RUNS = ['TAL-4471', 'MUD-9031'];
/** Seeds no lab tunes against: generation's held-out series. */
const GENERATION_SEEDS = ['BNC-0101', 'BNC-0202', 'BNC-0303', 'BNC-0404', 'BNC-0505', 'BNC-0606'];

export const BENCHES: Readonly<Record<LayerName, Bench>> = {
  kernel: {
    about: 'Runs with every lane switched off, and bodies spawned inside a tick: pinned by their fingerprints and work.',
    metrics: () => ({}),
  },
  generation: {
    about: "Lab D: valleys valid at their first attempt, of a held-out series, and the least margin left under the attempt budget.",
    metrics() {
      let first = 0;
      let margin = Infinity;
      const budget = defaultTuning.gen.world.maxGenAttempts;
      for (const seed of GENERATION_SEEDS) {
        const w = generateWorld(missionSpec(seed), defaultTuning);
        if (w.attempt === 0 && w.report.ok) first++;
        margin = Math.min(margin, budget - (w.attempt + 1));
      }
      return { [`valid at the first attempt (of ${GENERATION_SEEDS.length})`]: first, 'least margin under the attempt budget': margin };
    },
  },
  body: {
    about:
      "Lab C: the motor's promises under the person-like and the fuzzing bot, a minute each in two valleys, the closest calls, and the eye at the head: every lean's line of sight, both ways, beside the seed's camera-only lean.",
    metrics() {
      const m = {
        'body-ticks checked': 0,
        [`runs with a broken promise (of ${BODY_RUNS.length * 2})`]: 0,
        'bodies under the terrain': 0,
        'bodies inside something solid': 0,
        'worst overlap (m)': 0,
        'worst rise in a tick (m)': 0,
        'worst gain on steep ground (m)': 0,
      };
      for (const seed of BODY_RUNS) {
        const world = generateWorld(missionSpec(seed), defaultTuning);
        for (const bot of [new WanderBot(seed), new ChaosBot(seed)]) {
          const sim = new Simulation(world, defaultTuning);
          const watch = new InvariantWatch(sim);
          const raw = neutralInput();
          for (let i = 0; i < 60 * defaultTuning.sim.tickHz; i++) {
            watch.beforeTick();
            sim.step(bot.next(sim, raw));
            watch.afterTick();
          }
          const r = watch.report;
          m['body-ticks checked'] += r.checks;
          if (r.first) m[`runs with a broken promise (of ${BODY_RUNS.length * 2})`]++;
          m['bodies under the terrain'] += r.below;
          m['bodies inside something solid'] += r.inside;
          m['worst overlap (m)'] = Math.max(m['worst overlap (m)'], r.worstOverlap);
          m['worst rise in a tick (m)'] = Math.max(m['worst rise in a tick (m)'], r.worstRise);
          m['worst gain on steep ground (m)'] = Math.max(m['worst gain on steep ground (m)'], r.steepGain);
        }
      }
      return { ...m, ...eyeToHead() };
    },
  },
  perception: {
    about:
      "Lab A: the sight rate law swept over the factor grid against the design doc's ranges, beside the seed's (Blacklist's model with the table as rates); the sight scenarios run whole; foliage symmetric to the bit.",
    metrics: perceptionMetrics,
  },
  brain: { about: "Lab E: search cycle length, and the calibration of the camp's estimate of where a shot came from, from E5 on.", metrics: () => ({}) },
  ballistics: { about: 'Lab B: the reticle against the impact, within 1 cm, from B3 on.', metrics: () => ({}) },
  game: { about: "The valley's plays, which exercise every lane together: pinned by their fingerprints and work.", metrics: () => ({}) },
};

/**
 * Lean, and the eye at the head (C3): for 2,000 lean poses around the movement lab's walls
 * and a guard somewhere beyond, the line from the eye to the guard's head and the line
 * back. They are one segment, so they agree, bit for bit. Beside it the seed: a lean that
 * moves the camera and leaves the body's shape where it was, Dishonored's hidden lean, and
 * how often it sees a guard who has no line to the head he would aim at.
 */
function eyeToHead(): Record<string, number> {
  const world = arenaWorld(defaultTuning);
  const solids = new Solids(world.colliders);
  const view: QueryView = { world, solids, bodies: [] };
  const rng = new Rng('BENCH-C', 'lean');
  const P = defaultTuning.bodies.player;
  const G = defaultTuning.bodies.guard;
  const shape = emptyShape();
  const eye = { x: 0, y: 0, z: 0 };
  let differ = 0;
  let inView = 0;
  let unseen = 0;
  const pairs = 2000;
  for (let k = 0; k < pairs; k++) {
    const x = rng.range(-56, 56);
    const z = rng.range(-5, 2);
    const b = createBody(world, solids, P, x, z, 0, -1);
    b.yaw = rng.range(-Math.PI, Math.PI);
    b.lean = (rng.chance(0.5) ? 1 : -1) * rng.range(P.lean.peek * 0.5, P.lean.weapon);
    const head = bodyShape(b, P, shape).head;
    const g = createBody(world, solids, G, x + rng.range(-25, 25), z + rng.range(-20, 20), 0, 1);
    eyeOf(g, G, eye);
    const sees = sightLine(view, head.x, head.y, head.z, eye.x, eye.y, eye.z, Blocks.Sight);
    const seen = sightLine(view, eye.x, eye.y, eye.z, head.x, head.y, head.z, Blocks.Sight);
    if (sees !== seen) differ++;
    if (sees) inView++;
    // The seed: the camera moved aside, the head he aims at left over the feet.
    if (sees && !sightLine(view, eye.x, eye.y, eye.z, b.x, b.y + b.eyeHeight, b.z, Blocks.Sight)) unseen++;
  }
  return {
    [`lean: eye-to-head lines that differ by direction (of ${pairs})`]: differ,
    [`lean: pairs in view (of ${pairs})`]: inView,
    [`seed · lean: pairs where the camera sees a guard who has no line to the head (of ${pairs})`]: unseen,
  };
}

/** Lab A's bench (perception lane): docs/phase-1-plan.md, A · recorded before building, says what each should be. */
function perceptionMetrics(): Record<string, number> {
  const m: Record<string, number> = {};
  for (const [who, law] of [
    ['', SIGHT_LAW],
    ['seed · ', SEED_LAW],
  ] as const) {
    const r = sweepSight(defaultTuning, law);
    m[`${who}grid pairs checked`] = r.pairs;
    m[`${who}grid pairs filling slower with more exposure`] = r.violations;
    m[`${who}standing, walking, in the open: seen to (m)`] = r.standingReach;
    m[`${who}still, prone, in cover: seen to (m)`] = r.proneCoverReach;
    m[`${who}crouched, walking, in shade, 30 m: seconds`] = round(r.crouchShade30);
    m[`${who}a marksman's far zone: seen to (m)`] = r.farReach;
    m[`${who}least seconds from the first cue to 100%, outside contact`] = round(r.minCueSeconds);
    m[`${who}steepest edge: rate change per metre`] = round(r.steepestMetre);
    m[`${who}steepest edge: rate change per degree`] = round(r.steepestDegree);
  }
  let passed = 0;
  for (const params of SIGHT_TABLE) if (runScene(sightScenario(params), defaultTuning).failures.length === 0) passed++;
  m[`sight scenarios as expected (of ${SIGHT_TABLE.length})`] = passed;
  // Foliage, both ways, through every volume of the lab.
  const f = foliageOf(labWorld(defaultTuning));
  const rng = new Rng('BENCH-A', 'foliage');
  let asymmetric = 0;
  for (let k = 0; k < 2000; k++) {
    const v = f.volumes[k % f.volumes.length]!;
    const ax = v.x + rng.range(-30, 30);
    const ay = rng.range(0, 12);
    const az = v.z + rng.range(-30, 30);
    const bx = v.x + rng.range(-v.r, v.r);
    const by = rng.range(v.y0, v.y1);
    const bz = v.z + rng.range(-v.r, v.r);
    if (!Object.is(f.transmittance(ax, ay, az, bx, by, bz), f.transmittance(bx, by, bz, ax, ay, az))) asymmetric++;
  }
  m['foliage: pairs that differ by direction (of 2000)'] = asymmetric;
  // One law of sound: what the speakers hear and what a guard at the same place hears, bit for bit.
  const lab = labWorld(defaultTuning);
  const ears = new Acoustics(lab, defaultTuning);
  const guards = new Acoustics(lab, defaultTuning);
  const a = emptyHeard();
  const b = emptyHeard();
  let differ = 0;
  for (let k = 0; k < 200; k++) {
    const sx = -200 + rng.range(0, 80);
    const sz = -30 + rng.range(0, 60);
    const radius = rng.range(4, 40);
    const lx = sx + rng.range(-30, 30);
    const lz = sz + rng.range(-30, 30);
    ears.spread({ x: sx, y: 0, z: sz, radius });
    ears.hear(lx, 1.7, lz, a);
    guards.spread({ x: sx, y: 0, z: sz, radius });
    guards.hear(lx, 1.7, lz, b);
    if (!Object.is(a.clarity, b.clarity) || a.fromX !== b.fromX || a.fromZ !== b.fromZ || a.length !== b.length) differ++;
  }
  m['hearing: speakers and a guard at the same place differ (of 200)'] = differ;
  // The crack (A5): listeners 5–15 m from a bullet's path at 300 m, its speed falling as a
  // drag constant makes it (790 m/s at the muzzle, about 650 m/s there).
  const angles = crackBias();
  m['crack at 300 m: least degrees off the shooter'] = round(Math.min(...angles));
  m['crack at 300 m: most degrees off the shooter'] = round(Math.max(...angles));
  m['seed · crack at 300 m: degrees off the shooter'] = 0;
  return m;
}

/** Degrees between where the crack seems to come from and where the shooter is, for listeners near a path at 300 m. */
export function crackBias(): number[] {
  const v0 = 790;
  const k = 0.00065;
  const path: FlightPoint[] = [];
  for (let s = 0; s <= 420; s += 5) path.push({ x: s, y: 1.5, z: 0, t: (dexp(k * s) - 1) / (k * v0) });
  const out: CrackHeard = { x: 0, y: 0, z: 0, t: 0 };
  const c = air(defaultEnv()).speedOfSound;
  const angles: number[] = [];
  for (const side of [5, 10, 15]) {
    const L = { x: 300, y: 1.7, z: side };
    if (!crackHeard(path, L.x, L.y, L.z, c, out)) continue;
    const ax = out.x - L.x;
    const az = out.z - L.z;
    const bx = 0 - L.x;
    const bz = 0 - L.z;
    angles.push((datan2(Math.abs(ax * bz - az * bx), ax * bx + az * bz) * 180) / Math.PI);
  }
  return angles;
}

/** To 9 significant digits: metrics are pinned exactly, and their last bits are noise to a reader. */
function round(v: number): number {
  return Number.isFinite(v) ? Number(v.toPrecision(9)) : -1;
}

/** A pinned run as the bench sees it: its fingerprints, and the work each system did (systems that did none left out). */
export interface RunReport {
  behaviour: string;
  state: string;
  work: Record<string, WorkCounts>;
}

export interface LaneReport {
  runs: Record<string, RunReport>;
  metrics: Record<string, number>;
}

export type BenchReport = Record<LayerName, LaneReport>;

/** What benchGolden.ts pins for each lane: its metrics, and its runs' work (their fingerprints are golden.ts's). */
export type PinnedBench = Readonly<Record<LayerName, { metrics: Record<string, number>; runs: Record<string, { work: Record<string, WorkCounts> }> }>>;

/** Plays every pinned run and every lane's metrics. */
export function benchReport(): BenchReport {
  const report = {} as BenchReport;
  for (const lane of Object.keys(LAYERS) as LayerName[]) report[lane] = { runs: {}, metrics: BENCHES[lane].metrics() };
  for (const run of PINNED_RUNS) {
    const r = run.start();
    const h = new Hasher();
    while (!r.over) behaviourInto(h, r.sim, r.step());
    const work: Record<string, WorkCounts> = {};
    for (const w of r.sim.work()) if (w.rays + w.nodes + w.bodies > 0) work[w.system] = { rays: w.rays, nodes: w.nodes, bodies: w.bodies };
    report[run.lane].runs[run.name] = { behaviour: h.digest(), state: r.sim.hash(), work };
  }
  return report;
}
