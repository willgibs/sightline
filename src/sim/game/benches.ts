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
  perception: { about: "Lab A: detection times against the design doc's ranges, from A2 on.", metrics: () => ({}) },
  brain: { about: "Lab E: search cycle length, and the calibration of the camp's estimate of where a shot came from, from E5 on.", metrics: () => ({}) },
  ballistics: { about: 'Lab B: the reticle against the impact, within 1 cm, from B3 on.', metrics: () => ({}) },
  game: { about: "The valley's plays, which exercise every lane together: pinned by their fingerprints and work.", metrics: () => ({}) },
};

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
