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

/** How the spread between runs divides into what the camp decides and what the dice decide. */
export interface VarianceSplit {
  /** Standard deviation between the camps' own means, with the dice's share taken out. */
  camp: number;
  /** Standard deviation between rolls of the dice on one camp. */
  dice: number;
  /** The camp's share of the variance, 0 to 1; NaN if nothing varies at all. */
  campShare: number;
}

/**
 * One group per camp, one value per roll of the dice: the classic one-way split (random
 * effects, by mean squares), which also gives the two a fair weight when some rolls have
 * no value. Between-camp variance has the dice's share taken out of it, so a camp whose
 * mean is only luck counts for nothing. NaN entries are left out.
 */
export function splitVariance(groups: readonly (readonly number[])[]): VarianceSplit {
  const kept = groups.map((g) => g.filter((x) => !Number.isNaN(x))).filter((g) => g.length > 0);
  const n = kept.reduce((a, g) => a + g.length, 0);
  if (kept.length === 0 || n === kept.length) return { camp: NaN, dice: NaN, campShare: NaN };
  const grand = kept.reduce((a, g) => a + g.reduce((p, q) => p + q, 0), 0) / n;
  let between = 0;
  let within = 0;
  for (const g of kept) {
    const m = g.reduce((p, q) => p + q, 0) / g.length;
    between += g.length * (m - grand) * (m - grand);
    for (const x of g) within += (x - m) * (x - m);
  }
  const dice = within / (n - kept.length);
  // With one camp there's nothing to say about camps.
  if (kept.length === 1) return { camp: NaN, dice: Math.sqrt(dice), campShare: NaN };
  const size = (n - kept.reduce((a, g) => a + g.length * g.length, 0) / n) / (kept.length - 1);
  const camp = Math.max(0, (between / (kept.length - 1) - dice) / size);
  return { camp: Math.sqrt(camp), dice: Math.sqrt(dice), campShare: camp + dice > 0 ? camp / (camp + dice) : NaN };
}

/**
 * A proportion over several rolls of the dice per camp. Rolls on one camp resemble each
 * other, so they aren't that many independent trials: the count shrinks by how much they
 * do (the design effect) before Wilson's interval is taken. With one roll each, or rolls
 * that resemble each other no more than strangers do, it's Wilson's interval as it stands.
 */
export function clusteredRate(k: number, n: number, rolls: number, split: VarianceSplit | null): Interval {
  const icc = split && !Number.isNaN(split.campShare) ? split.campShare : 0;
  const effect = 1 + (rolls - 1) * icc;
  return wilson(k / effect, n / effect);
}

/** True if an interval doesn't contain zero: the difference is more than the camps' own variation. */
export function excludesZero(i: Interval): boolean {
  return i.low > 0 || i.high < 0;
}
