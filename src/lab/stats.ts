/**
 * How sure a measured difference is, for the lab bench (Lab F, docs/camp-engine.md). A
 * decision shouldn't rest on a number that one more camp would move: every figure the
 * bench reports comes with an interval, and every comparison is paired by seed, so what
 * differs between two arms of an experiment is the arm and not the camps.
 *
 * Reporting only: nothing here feeds the simulation, so ordinary floating point is fine.
 */

export interface Interval {
  value: number;
  low: number;
  high: number;
}

/** About 95%. */
const Z = 1.96;

/** A proportion, k of n, by Wilson's score interval: it behaves at 0 of 30, where the textbook interval collapses. */
export function wilson(k: number, n: number): Interval {
  if (n === 0) return { value: NaN, low: NaN, high: NaN };
  const p = k / n;
  const zz = Z * Z;
  const centre = (p + zz / (2 * n)) / (1 + zz / n);
  const half = (Z * Math.sqrt((p * (1 - p)) / n + zz / (4 * n * n))) / (1 + zz / n);
  return { value: p, low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

/** A mean, with a normal interval on it. NaN entries (a measure that didn't apply in a run) are left out. */
export function mean(xs: readonly number[]): Interval {
  const v = xs.filter((x) => !Number.isNaN(x));
  if (v.length === 0) return { value: NaN, low: NaN, high: NaN };
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  if (v.length === 1) return { value: m, low: m, high: m };
  const variance = v.reduce((a, b) => a + (b - m) * (b - m), 0) / (v.length - 1);
  const half = Z * Math.sqrt(variance / v.length);
  return { value: m, low: m - half, high: m + half };
}

/** The middle value of a list, ignoring NaN; NaN for an empty one. */
export function median(xs: readonly number[]): number {
  const v = xs.filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  return v.length === 0 ? NaN : v.length % 2 === 1 ? v[(v.length - 1) / 2]! : (v[v.length / 2 - 1]! + v[v.length / 2]!) / 2;
}

/** The mean of b − a across the same seeds, position by position. A pair with a NaN on either side is left out. */
export function pairedDifference(a: readonly number[], b: readonly number[]): Interval {
  if (a.length !== b.length) throw new Error(`Paired samples differ in length: ${a.length} and ${b.length}`);
  return mean(a.map((x, k) => b[k]! - x));
}

/** True if an interval doesn't contain zero: the difference is more than the camps' own variation. */
export function excludesZero(i: Interval): boolean {
  return i.low > 0 || i.high < 0;
}
