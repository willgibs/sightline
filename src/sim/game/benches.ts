import { defaultTuning } from '../../config/tuning';
import { InvariantWatch } from '../body';
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
import { Acoustics, SEED_LAW, SIGHT_LAW, crackHeard, drawnLit, emptyHeard, foliageOf, groundLight, shadeMap, sweepSight, type CrackHeard, type FlightPoint } from '../perception';
import { Solids } from '../kernel/world/solids';
import { datan2, dexp } from '../kernel/core/detmath';
import { air, defaultEnv } from '../kernel/env';
import { Rng } from '../kernel/core/rng';
import { runScene } from '../kernel/scene';
import { labWorld } from './scenes/perceptionLab';
import { SIGHT_TABLE, sightScenario } from './scenes/sightScenario';
import { FACTORS, SITTING, generateSitting, pairsCovered, scoreSitting, verdict, type Trial } from './trials';

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
    about: "Lab C: the motor's promises under the person-like and the fuzzing bot, a minute each in two valleys, and the closest calls.",
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
      return m;
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
  // Shade drawn as simulated (A4): the drawn map against the simulation's light, over the area and at the edges.
  const solids = new Solids(lab.colliders);
  const area = lab.shadeArea!;
  const map = shadeMap(lab, solids, lab.spec.env, 0, area, defaultTuning);
  const simLit = (x: number, z: number): boolean =>
    groundLight(lab, solids, lab.spec.env, 0, x, lab.terrain.heightAt(x, z), z, defaultTuning) === defaultTuning.visibility.light.lit;
  let agree = 0;
  for (let k = 0; k < 20000; k++) {
    const x = rng.range(area.x0, area.x1);
    const z = rng.range(area.z0, area.z1);
    if (drawnLit(map, x, z) === simLit(x, z)) agree++;
  }
  m['shade: drawn as simulated, of 20000 points'] = agree;
  const shaded: number[] = [];
  for (let k = 0; k < map.lit.length; k++) if (map.lit[k] === 0) shaded.push(k);
  let edges = 0;
  for (let k = 0; k < 6000; k++) {
    const c = shaded[rng.int(0, shaded.length - 1)]!;
    const x = map.x0 + ((c % map.nx) + 0.5) * map.cell + rng.range(-1.5, 1.5);
    const z = map.z0 + (Math.floor(c / map.nx) + 0.5) * map.cell + rng.range(-1.5, 1.5);
    if (drawnLit(map, x, z) === simLit(x, z)) edges++;
  }
  m['shade: drawn as simulated within 1.5 m of a shadow, of 6000 points'] = edges;
  // The crack (A5): listeners 5–15 m from a bullet's path at 300 m, its speed falling as a
  // drag constant makes it (790 m/s at the muzzle, about 650 m/s there).
  const angles = crackBias();
  m['crack at 300 m: least degrees off the shooter'] = round(Math.min(...angles));
  m['crack at 300 m: most degrees off the shooter'] = round(Math.max(...angles));
  m['seed · crack at 300 m: degrees off the shooter'] = 0;
  Object.assign(m, trialMetrics());
  return m;
}

/**
 * Trial mode (A12) on two pinned sittings: what the sittings hold, and how often the
 * protocol passes readers of known skill, against the plan's first rule (seed: 48 of 60
 * right). docs/research/foundations.md found the seed passes a reader who is right on every
 * clear trial and guesses the borderline ones about 18% of the time, and a true 80% reader
 * 57%.
 */
function trialMetrics(): Record<string, number> {
  const m: Record<string, number> = {};
  let candidates = 0;
  const sittings = ['BENCH-A-1', 'BENCH-A-2'].map((seed) => generateSitting(seed, defaultTuning, undefined, () => candidates++));
  const scored = sittings.flatMap((ts) => ts.filter((t) => !t.warmup));
  m['trials: candidates run for two sittings'] = candidates;
  m['trials: scored trials in two sittings'] = scored.length;
  m['trials: pairs of factor levels the first sitting covers'] = pairsCovered(sittings[0]!);
  m['seed · trials: pairs of factor levels covered, taken first come'] = pairsCovered(generateSitting('BENCH-A-1', defaultTuning, { ...SITTING, pool: 1 }));
  const key = (ts: readonly Trial[], f: (t: Trial) => boolean): Map<number, boolean> => new Map(ts.map((t) => [t.k, f(t)]));
  const rules = sittings.map((ts) => scoreSitting(ts, key(ts, (t) => t.rules)));
  m['trials: borderline right by the sight table alone (of 30)'] = rules[0]!.borderlineRight + rules[1]!.borderlineRight;
  m["trials: the rules-only predictor's balanced accuracy, first sitting (%)"] = round(rules[0]!.balanced * 100);
  m['trials: frozen at the first cue (of 60)'] = scored.filter((t) => t.freeze === 'cue').length;
  m['trials: cue-frozen trials where his head can be read'] = scored.filter((t) => t.freeze === 'cue' && t.legible.head).length;
  for (const f of FACTORS) m[`trials: borderline trials ${f} flips`] = scored.filter((t) => t.flips.includes(f)).length;
  // Readers of known skill, 4000 pairs of sittings each.
  const rng = new Rng('BENCH-A', 'readers');
  const [a, b] = sittings as [Trial[], Trial[]];
  const readers: Array<[string, (t: Trial) => number]> = [
    ['right on every clear trial, guessing the borderline', (t) => (t.borderline ? 0.5 : 1)],
    ['right 80% of the time', () => 0.8],
    ['right 90% of the time', () => 0.9],
  ];
  for (const [who, p] of readers) {
    let ours = 0;
    let seed = 0;
    const draws = 4000;
    for (let k = 0; k < draws; k++) {
      const answers = (ts: readonly Trial[]): Map<number, boolean> => new Map(ts.map((t) => [t.k, rng.chance(p(t)) ? t.seen : !t.seen]));
      const A = answers(a);
      const B = answers(b);
      if (verdict({ trials: a, answers: A }, { trials: b, answers: B }).pass) ours++;
      const right = (ts: readonly Trial[], ans: Map<number, boolean>): number => ts.filter((t) => !t.warmup && ans.get(t.k) === t.seen).length;
      if (right(a, A) + right(b, B) >= 48) seed++;
    }
    m[`trials: a reader ${who}: passes (% of ${draws})`] = round((100 * ours) / draws);
    m[`seed · trials: a reader ${who}: passes (% of ${draws})`] = round((100 * seed) / draws);
  }
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
