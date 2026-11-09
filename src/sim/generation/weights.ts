import type { Rng } from '../kernel/core/rng';

/** Picks a key from relative weights, in the order the keys are given: the same pick in every engine. */
export function pickWeighted<K extends string>(rng: Rng, weights: Readonly<Record<K, number>>, keys: readonly K[]): K {
  let sum = 0;
  for (const k of keys) sum += weights[k];
  let x = rng.next() * sum;
  for (const k of keys) {
    x -= weights[k];
    if (x < 0) return k;
  }
  return keys[0]!;
}
