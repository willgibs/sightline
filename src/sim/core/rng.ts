/**
 * Seeded random numbers.
 *
 * Every random choice in the simulation comes from an Rng; Math.random is never used.
 * Streams are forked by label: `rng.fork('props')` depends only on the root seed and the
 * label path, never on how many numbers the parent has drawn. Adding a new consumer
 * later therefore never shifts the numbers an existing one sees, so old seeds keep
 * producing the same valley.
 *
 * Integer math only (Math.imul and 32-bit ops), so results match in every engine.
 */

/** cyrb128: hash a string to four 32-bit words. */
export function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export class Rng {
  readonly seed: string;
  readonly path: string;
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: string, path = 'root') {
    this.seed = seed;
    this.path = path;
    const [a, b, c, d] = cyrb128(`${seed}␟${path}`);
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    // Warm up so nearby seeds diverge immediately.
    for (let i = 0; i < 15; i++) this.nextU32();
  }

  /**
   * An independent stream for a named consumer. Labels can't contain '/', because
   * fork('a/b') and fork('a').fork('b') would otherwise be the same stream.
   */
  fork(label: string): Rng {
    if (label.includes('/') || label.includes('␟')) throw new Error(`Rng.fork: label "${label}" contains a separator`);
    return new Rng(this.seed, `${this.path}/${label}`);
  }

  /** sfc32: a uniformly distributed 32-bit unsigned integer. */
  nextU32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** The generator's internal state, for hashing. Does not advance the stream. */
  stateWords(): [number, number, number, number] {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0];
  }

  /** Uniform in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** Uniform in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Uniform in [lo, hi) from a two-element range. */
  between(r: readonly number[]): number {
    return this.range(r[0]!, r[1]!);
  }

  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty list');
    return items[Math.floor(this.next() * items.length)]!;
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = items[i]!;
      items[i] = items[j]!;
      items[j] = tmp;
    }
    return items;
  }

  /** A uniformly random 2D unit vector, by rejection sampling (no trigonometry). */
  unit2(): { x: number; z: number } {
    for (;;) {
      const x = this.next() * 2 - 1;
      const z = this.next() * 2 - 1;
      const l2 = x * x + z * z;
      if (l2 > 1e-4 && l2 <= 1) {
        const l = Math.sqrt(l2);
        return { x: x / l, z: z / l };
      }
    }
  }

  /** Roughly normal (mean 0, sd 1) via the sum of four uniforms; no transcendental math. */
  normalish(): number {
    return (this.next() + this.next() + this.next() + this.next() - 2) * 1.7320508075688772;
  }
}
