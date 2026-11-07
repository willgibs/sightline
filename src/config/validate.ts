import { defaultTuning, type Tuning } from './tuning';

/**
 * Checks a tuning object before anything trusts it.
 *
 * - Shape: the same keys as the defaults, all the way down, with the same kinds of
 *   values and the same array lengths.
 * - Numbers: finite, and never −0. NaN, ±Infinity and −0 don't survive the JSON a
 *   recording stores, so a run using them could never replay.
 * - Bounds on the numbers that size loops and allocations (world size, cell size, prop
 *   spacing, generation attempts, tick rate), so a hostile or corrupt recording can't
 *   hang generation or exhaust memory.
 *
 * Recordings embed their tuning and hot reload swaps it live, so both go through here.
 */

export class TuningError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid tuning: ${problems.join('; ')}`);
    this.name = 'TuningError';
  }
}

/** Inclusive bounds on values that size loops or allocations. */
const BOUNDS: ReadonlyArray<readonly [path: string, min: number, max: number, integer?: boolean]> = [
  ['sim.tickHz', 10, 240, true],
  ['sim.recordHz', 1, 240, true],
  ['gen.world.size', 64, 4096],
  ['gen.world.cellSize', 0.5, 20],
  ['gen.world.playMargin', 0, 1000],
  ['gen.world.maxGenAttempts', 1, 32, true],
  ['gen.props.treeSpacing', 1, 1000],
  ['gen.props.rockSpacing', 1, 1000],
  ['gen.props.bushSpacing', 1, 1000],
  ['gen.props.treeCover', 0, 1],
  ['gen.walkableSlopeDeg', 1, 89],
  ['player.maxSlopeDeg', 1, 89],
  ['player.stepHeight', 0, 2],
  ['player.radius', 0.05, 2],
];

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
  return problems;
}

export function assertTuning(t: unknown): asserts t is Tuning {
  const problems = tuningProblems(t);
  if (problems.length > 0) throw new TuningError(problems);
}

function compare(value: unknown, ref: unknown, path: string, out: string[]): void {
  if (typeof ref === 'number') {
    if (typeof value !== 'number') out.push(`${path} should be a number`);
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
    ref.forEach((r, i) => compare(value[i], r, `${path}[${i}]`, out));
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
      else compare(v[key], r[key], `${path}.${key}`, out);
    }
    for (const key of Object.keys(v)) if (!(key in r)) out.push(`${path}.${key} is not a tuning value`);
  }
}

function read(t: Tuning, path: string): unknown {
  let v: unknown = t;
  for (const k of path.split('.')) v = (v as Record<string, unknown>)?.[k];
  return v;
}
