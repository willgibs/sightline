/**
 * Utility scoring (E3): how a guard weighs what to do inside each state of awareness.
 *
 * Guild Wars 2's considerations: an option's weight is the product of 0–1 scores, each a
 * raw input read through a response curve (tuning.brain.curves), and any zero stops it.
 * Zoo Tycoon 2's rank-then-weight choice: options of the highest rank with any weight
 * compete, those within `pickShare` of the best by weight are drawn among, from the
 * guard's own stream (GuardMind.draw). Only + - * / here: exact in every engine.
 */

/** A response curve: `at0` at or below `from`, `at1` at or above `to`, between them linear. */
export interface Curve {
  from: number;
  to: number;
  at0: number;
  at1: number;
}

/** A curve's value at x. */
export function response(c: Readonly<Curve>, x: number): number {
  const t = (x - c.from) / (c.to - c.from);
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return c.at0 + (c.at1 - c.at0) * u;
}

export interface Option<A extends string> {
  act: A;
  rank: number;
  weight: number;
}

const live: Array<Option<string>> = [];

/**
 * Rank, then weight: keeps the options of the highest rank with any weight, then those
 * within `share` of the best weight, and draws one by weight. Options keep the order
 * given, so ties are broken by that order. Returns the chosen option, or null if none has
 * any weight. `draw` is called at most once, and only when there is a real choice.
 */
export function choose<A extends string>(options: readonly Option<A>[], share: number, draw: () => number): Option<A> | null {
  let rank = -Infinity;
  for (const o of options) if (o.weight > 0 && o.rank > rank) rank = o.rank;
  if (rank === -Infinity) return null;
  live.length = 0;
  let best = 0;
  for (const o of options) {
    if (o.weight <= 0 || o.rank !== rank) continue;
    live.push(o);
    if (o.weight > best) best = o.weight;
  }
  let total = 0;
  let n = 0;
  for (const o of live) {
    if (o.weight >= best * share) {
      total += o.weight;
      n++;
    }
  }
  if (n === 1) for (const o of live) if (o.weight >= best * share) return o as Option<A>;
  const roll = draw() * total;
  let acc = 0;
  let last: Option<string> | null = null;
  for (const o of live) {
    if (o.weight < best * share) continue;
    last = o;
    acc += o.weight;
    if (roll < acc) return o as Option<A>;
  }
  return last as Option<A> | null;
}
