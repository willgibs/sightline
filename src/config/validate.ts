import { defaultTuning, type Tuning } from './tuning';

// Hot reload (CLAUDE.md rule 4): main.ts applies a saved tuning.ts to the running game.
// This module reads the defaults too, so it must take the update as well, or Vite reloads
// the whole page and the run is lost. It keeps checking against the shape it loaded with:
// a change of shape comes with code that reads it, and is refused until the page reloads.
import.meta.hot?.accept('./tuning', () => undefined);

/**
 * Checks a tuning object before anything trusts it.
 *
 * - Shape: the same keys as the defaults, all the way down, with the same kinds of
 *   values and the same array lengths.
 * - Numbers: finite, and never −0. NaN, ±Infinity and −0 don't survive the JSON a
 *   recording stores, so a run using them could never replay.
 * - Bounds on the numbers that size loops and allocations (world size, cell size, prop
 *   spacing, generation attempts, tick rate), so a hostile or corrupt recording can't
 *   hang generation or exhaust memory; and on the view numbers nothing could draw with.
 *
 * Recordings embed their tuning and hot reload swaps it live, so both go through here.
 */

export class TuningError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid tuning: ${problems.join('; ')}`);
    this.name = 'TuningError';
  }
}

/** Inclusive bounds on values that size loops or allocations, or that nothing could draw or divide by. */
const BOUNDS: ReadonlyArray<readonly [path: string, min: number, max: number, integer?: boolean]> = [
  // The view: a field of view of 0 or 180 has no projection, and the look scale divides by it.
  ['view.fov', 10, 150],
  ['view.zoomFov', 1, 150],
  ['view.zoomTime', 0, 5],
  ['view.lookSensitivity', 0, 1],
  ['view.headBob', 0, 5],
  ['view.bob.crawl', 0, 0.2],
  ['view.bob.crouch', 0, 0.2],
  ['view.bob.walk', 0, 0.2],
  ['view.bob.sprint', 0, 0.2],
  ['view.fogDensity', 0, 0.1],
  ['sim.tickHz', 10, 240, true],
  ['sim.recordHz', 1, 240, true],
  ['sim.dice', 0, 1000000, true],
  ['gen.world.size', 64, 4096],
  ['gen.world.cellSize', 0.5, 20],
  ['gen.world.playMargin', 0, 1000],
  ['gen.landform.attempts', 1, 32, true],
  ['gen.validation.campAttempts', 1, 16, true],
  ['gen.validation.repairAttempts', 0, 256, true],
  ['gen.analysis.maxExpansions', 1, 20000000, true],
  ['gen.analysis.clusterExpansions', 1, 2000000, true],
  ['gen.props.treeSpacing', 1, 1000],
  ['gen.props.rockSpacing', 1, 1000],
  ['gen.props.bushSpacing', 1, 1000],
  ['gen.props.treeCover', 0, 1],
  ['gen.props.canopyCell', 1, 64],
  ['gen.walkableSlopeDeg', 1, 89],
  // What a shot's sounds are read against: clear has to be past the edge of hearing, or the ramp divides by nothing.
  ['perception.awareness.shots.report.clearAt', 1.01, 10000],
  ['perception.awareness.shots.crack.clearAt', 1.01, 10000],
  ['perception.awareness.shots.impact.clearAt', 1.01, 10000],
  ['perception.awareness.shots.bolt.clearAt', 1.01, 10000],
  ['modes.takedown.shots.report.clearAt', 1.01, 10000],
  ['modes.takedown.shots.crack.clearAt', 1.01, 10000],
  ['modes.takedown.shots.impact.clearAt', 1.01, 10000],
  ['modes.takedown.shots.bolt.clearAt', 1.01, 10000],
  // Budgets that size searches inside a tick (rule 18), so a hostile recording can't hang a guard's brain.
  ['brain.nav.siteExpansions', 1, 500000, true],
  ['brain.nav.mapExpansions', 1, 500000, true],
  ['brain.nav.landmarks', 0, 64, true],
  ['brain.nav.landmarkCells', 0, 4000000, true],
  ['brain.nav.searchesPerTick', 1, 64, true],
  ['brain.nav.pullAhead', 1, 4000, true],
  ['brain.nav.snapRadius', 0, 64],
  ['brain.nav.sampleStep', 0.05, 2],
  // Ballistics: what sizes a bullet's life and the zero dial's steps, and what the flight divides by.
  ['ballistics.rifle.rounds', 0, 1000, true],
  ['ballistics.rifle.boltTime', 0, 30],
  ['ballistics.rifle.raiseTime', 0, 10],
  ['ballistics.rifle.zero.min', 1, 5000],
  ['ballistics.rifle.zero.max', 1, 5000],
  ['ballistics.rifle.zero.step', 1, 5000],
  ['ballistics.rifle.zero.start', 1, 5000],
  ['ballistics.maxFlight', 0.1, 20],
  ['ballistics.airDensity', 0.1, 5],
  ['ballistics.scope.fieldDeg', 0.2, 60],
  ['ballistics.binoculars.fieldDeg', 0.2, 60],
  ['ballistics.binoculars.rangeMax', 1, 10000],
  ['ballistics.throwable.count', 0, 100, true],
  ['ballistics.throwable.maxFlight', 0.1, 60],
  ['ballistics.sway.tremorRate', 0, 100],
  ...Object.keys(defaultTuning.ballistics.loads).flatMap((load) =>
    (
      [
        ['muzzleSpeed', 50, 3000],
        ['drag', 0, 0.05],
      ] as const
    ).map(([path, min, max]) => [`ballistics.loads.${load}.${path}`, min, max] as const),
  ),
  ['vitals.restingHr', 20, 250],
  ['vitals.maxHr', 20, 250],
  ['vitals.holdTime', 0, 120],
  ['vitals.recoverTime', 0.1, 600],
  // Every kind of body: sizes that set how far collision looks, and limits whose tangent is taken.
  ...Object.keys(defaultTuning.bodies).flatMap((kind) =>
    (
      [
        ['maxSlopeDeg', 1, 89],
        ['stepHeight', 0, 2],
        ['radius', 0.05, 2],
        ['stanceTime.crouch', 0, 5],
        ['stanceTime.prone', 0, 5],
        ['pitchLimit', 0, 1.5],
      ] as const
    ).map(([path, min, max]) => [`bodies.${kind}.${path}`, min, max] as const),
  ),
];

/** Where a tuning's keys and kinds of value differ from this build's: a tuning from another build, or not a tuning at all. */
export function tuningShapeProblems(t: unknown): string[] {
  const problems: string[] = [];
  compare(t, defaultTuning, 'tuning', problems, true);
  return problems;
}

export function tuningProblems(t: unknown): string[] {
  const problems: string[] = [];
  compare(t, defaultTuning, 'tuning', problems);
  if (problems.length > 0) return problems;
  const tuning = t as Tuning;
  for (const [path, min, max, integer] of BOUNDS) {
    const v = read(tuning, path);
    if (typeof v !== 'number' || v < min || v > max || (integer && Math.floor(v) !== v)) {
      problems.push(`${path} is ${String(v)}, outside ${min}–${max}${integer ? ' (whole numbers)' : ''}`);
    }
  }
  const size = tuning.gen.world.size;
  if (size / tuning.gen.world.cellSize > 2048) problems.push('gen.world.size / cellSize exceeds 2048 cells per side');
  if (tuning.gen.world.playMargin * 2 >= size - 20) problems.push('gen.world.playMargin leaves no play area');
  if (tuning.sim.tickHz % tuning.sim.recordHz !== 0) problems.push('sim.recordHz must divide sim.tickHz');
  const Z = tuning.ballistics.rifle.zero;
  if (Z.min > Z.max || Z.start < Z.min || Z.start > Z.max) problems.push('ballistics.rifle.zero must run from min to max, with start between');
  if (!(tuning.ballistics.rifle.load in tuning.ballistics.loads)) problems.push(`ballistics.rifle.load '${tuning.ballistics.rifle.load}' names no load`);
  if ((tuning.ballistics.rifle.carries as Record<string, boolean>)[tuning.ballistics.rifle.load] !== true) problems.push('ballistics.rifle.carries must include the load the rifle starts with');
  return problems;
}

/**
 * A private, frozen copy of a tuning: what a simulation runs on. Changing the caller's
 * object afterwards changes nothing, and nothing can change the copy, so every change
 * to a running simulation's tuning goes through setTuning, where the recorder sees it.
 */
export function frozenTuning(t: Tuning): Tuning {
  return deepFreeze(structuredClone(t));
}

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    for (const x of Object.values(v)) deepFreeze(x);
    Object.freeze(v);
  }
  return v;
}

export function assertTuning(t: unknown): asserts t is Tuning {
  const problems = tuningProblems(t);
  if (problems.length > 0) throw new TuningError(problems);
}

function compare(value: unknown, ref: unknown, path: string, out: string[], shapeOnly = false): void {
  if (typeof ref === 'number') {
    if (typeof value !== 'number') out.push(`${path} should be a number`);
    else if (shapeOnly) return;
    else if (!Number.isFinite(value)) out.push(`${path} is ${String(value)}`);
    else if (Object.is(value, -0)) out.push(`${path} is -0`);
    return;
  }
  if (typeof ref === 'boolean' || typeof ref === 'string') {
    if (typeof value !== typeof ref) out.push(`${path} should be a ${typeof ref}`);
    return;
  }
  if (Array.isArray(ref)) {
    if (!Array.isArray(value) || value.length !== ref.length) {
      out.push(`${path} should be a list of ${ref.length}`);
      return;
    }
    ref.forEach((r, i) => compare(value[i], r, `${path}[${i}]`, out, shapeOnly));
    return;
  }
  if (ref && typeof ref === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      out.push(`${path} should be an object`);
      return;
    }
    const v = value as Record<string, unknown>;
    const r = ref as Record<string, unknown>;
    for (const key of Object.keys(r)) {
      if (!(key in v)) out.push(`${path}.${key} is missing`);
      else compare(v[key], r[key], `${path}.${key}`, out, shapeOnly);
    }
    for (const key of Object.keys(v)) if (!(key in r)) out.push(`${path}.${key} is not a tuning value`);
  }
}

function read(t: Tuning, path: string): unknown {
  let v: unknown = t;
  for (const k of path.split('.')) v = (v as Record<string, unknown>)?.[k];
  return v;
}
