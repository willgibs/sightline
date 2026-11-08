import { defaultTuning } from '../../config/tuning';
import { InvariantWatch } from '../body';
import { analyzeCamp, campMission, generateWorld, infiltrate, spaceTimeSearch } from '../generation';
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
import { SIGHT_TABLE, sightScenario } from './scenes/sightScenario';
import { SWAY_RUNGS, decisionSensitivity, swayRadius, sweepCases, sweepWorst } from './ballisticsBench';

/** A metric to four decimals: enough to see a change, and the same bits everywhere it's computed. */
function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

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
    about:
      "Lab D: of a held-out series, Phase 0's valleys and lab D's valid at their first attempt, the least margin left under each budget, how much of the horizon lab D's ridges overlook, and the analysis of lab D's camps: valid at the first attempt, repaired, rules left broken, ways in and out, unsolved clusters, the busiest search, and safe intervals against the plain search.",
    metrics() {
      let first = 0;
      let margin = Infinity;
      const budget = defaultTuning.gen.world.maxGenAttempts;
      for (const seed of GENERATION_SEEDS) {
        const w = generateWorld(missionSpec(seed), defaultTuning);
        if (w.attempt === 0 && w.report.ok) first++;
        margin = Math.min(margin, budget - (w.attempt + 1));
      }
      // Lab D's valleys (D3), until D9 makes them the default.
      let campFirst = 0;
      let campMargin = Infinity;
      let widest = 0;
      let narrowestOpen = Infinity;
      const valleyBudget = defaultTuning.gen.landform.attempts;
      for (const seed of GENERATION_SEEDS) {
        const w = generateWorld(campMission(seed), defaultTuning);
        const v = w.report.valley!;
        if (w.attempt === 0 && v.ok) campFirst++;
        campMargin = Math.min(campMargin, valleyBudget - (w.attempt + 1));
        widest = Math.max(widest, Math.round(v.perchArcDeg));
        narrowestOpen = Math.min(narrowestOpen, Math.round(v.openGapDeg));
      }
      // Lab D's analysis of its camps (D7): ways in found, clusters left unsolved, and the
      // busiest search against its budget; and on the first, the gain of safe intervals over
      // the plain space-time search, by states expanded on the way in.
      let wayIn = 0;
      let unsolved = 0;
      let busiest = 0;
      let firstTry = 0;
      let repaired = 0;
      let broken = 0;
      let mostAttempts = 0;
      let sipp = 0;
      let plain = 0;
      for (const seed of GENERATION_SEEDS) {
        const w = generateWorld(campMission(seed), defaultTuning);
        const a = w.report.camp!;
        if (a.infiltration.found && a.exfil.found) wayIn++;
        unsolved += a.clusters.filter((c) => c.certified === 'unsolved').length;
        busiest = Math.max(busiest, a.infiltration.expanded, a.sabotage.expanded, a.exfil.expanded, a.exfil2.expanded, a.vehicle.expanded);
        const repairs = w.report.repairs ?? [];
        if (w.report.validation!.ok && repairs.length === 0 && w.attempt === 0 && (w.report.campAttempt ?? 0) === 0) firstTry++;
        else if (w.report.validation!.ok) repaired++;
        broken += w.report.validation!.failed.length;
        mostAttempts = Math.max(mostAttempts, w.report.repairAttempts ?? 0);
        if (seed === GENERATION_SEEDS[0]) {
          // The exact search against the plain one (the analysis itself runs a greedy one first, which finds a way sooner still).
          sipp = analyzeCamp(w.camp, w.terrain, w.colliders, w.grid, defaultTuning.gen, undefined, (S, E, M, Q) => infiltrate(S, E, M, { ...Q, weight: 1 })).analysis.infiltration.expanded;
          plain = analyzeCamp(w.camp, w.terrain, w.colliders, w.grid, defaultTuning.gen, undefined, spaceTimeSearch).analysis.infiltration.expanded;
        }
      }
      return {
        [`valid at the first attempt (of ${GENERATION_SEEDS.length})`]: first,
        'least margin under the attempt budget': margin,
        [`lab D valleys valid at the first attempt (of ${GENERATION_SEEDS.length})`]: campFirst,
        'lab D least margin under the valley budget': campMargin,
        'lab D widest overwatched horizon (°)': widest,
        'lab D narrowest open horizon (°)': narrowestOpen,
        [`lab D camps valid at the first attempt, no repair (of ${GENERATION_SEEDS.length})`]: firstTry,
        'lab D camps repaired': repaired,
        'lab D rules still broken': broken,
        [`lab D most re-analyses in a repair (of ${defaultTuning.gen.validation.repairAttempts})`]: mostAttempts,
        [`lab D camps with a way in and out (of ${GENERATION_SEEDS.length})`]: wayIn,
        'lab D clusters left unsolved': unsolved,
        [`lab D busiest search (of ${defaultTuning.gen.analysis.maxExpansions} expansions)`]: busiest,
        'lab D way in, states expanded: safe intervals': sipp,
        'lab D way in, states expanded: plain space-time search': plain,
      };
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
  ballistics: {
    about: 'Lab B: the reticle against the impact within 1 cm over the sweep, decision sensitivity at 300 m, and the sway ladder.',
    metrics() {
      const m: Record<string, number> = {};
      m[`reticle against impact, worst of ${sweepCases().length} shots (cm)`] = round4(sweepWorst(defaultTuning) * 100);
      const s = decisionSensitivity(defaultTuning);
      m['300 m walker: head radius (mil)'] = round4(s.head);
      m['300 m walker: drop skipped (mil off)'] = round4(s.drop);
      m['300 m walker: lead skipped (mil off)'] = round4(s.lead);
      m['300 m walker: wind skipped (mil off)'] = round4(s.wind);
      m['300 m walker: ranged by eye, 15% out (mil off)'] = round4(s.ranging);
      for (const rung of SWAY_RUNGS) m[`sway, ${rung.name} (mil, 95th percentile)`] = round4(swayRadius(rung, defaultTuning));
      return m;
    },
  },
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
