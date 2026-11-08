import { describe, expect, it } from 'vitest';
import { KNOWN_SQRT, bitsOf, knownAnswerProblems } from '../src/sim/kernel/core/known';

/**
 * The known answers (kernel/core/known.ts) hold in this engine, the square roots among
 * them are the correctly rounded ones (proved here with exact integer arithmetic, not
 * taken from any engine), and a wrong `Math.sqrt` is caught.
 */

/** A finite double as n · 2^e exactly. */
interface Dyadic {
  n: bigint;
  e: number;
}

function fromBits(hex: string): number {
  const v = new DataView(new ArrayBuffer(8));
  v.setBigUint64(0, BigInt(`0x${hex}`), false);
  return v.getFloat64(0, false);
}

function dyadic(x: number): Dyadic {
  const v = new DataView(new ArrayBuffer(8));
  v.setFloat64(0, x, false);
  const bits = v.getBigUint64(0, false);
  const exp = Number((bits >> 52n) & 0x7ffn);
  const frac = bits & ((1n << 52n) - 1n);
  return exp === 0 ? { n: frac, e: -1074 } : { n: frac | (1n << 52n), e: exp - 1075 };
}

/** The neighbouring double, up or down (x positive and finite). */
function step(x: number, d: 1 | -1): number {
  const v = new DataView(new ArrayBuffer(8));
  v.setFloat64(0, x, false);
  v.setBigUint64(0, v.getBigUint64(0, false) + BigInt(d), false);
  return v.getFloat64(0, false);
}

const align = (a: Dyadic, b: Dyadic): [bigint, bigint] => {
  const e = Math.min(a.e, b.e);
  return [a.n << BigInt(a.e - e), b.n << BigInt(b.e - e)];
};
const add = (a: Dyadic, b: Dyadic): Dyadic => {
  const [x, y] = align(a, b);
  return { n: x + y, e: Math.min(a.e, b.e) };
};
const half = (a: Dyadic): Dyadic => ({ n: a.n, e: a.e - 1 });
const square = (a: Dyadic): Dyadic => ({ n: a.n * a.n, e: 2 * a.e });
const compare = (a: Dyadic, b: Dyadic): number => {
  const [x, y] = align(a, b);
  return x < y ? -1 : x > y ? 1 : 0;
};

describe('known answers', () => {
  it('hold in this engine', () => {
    expect(knownAnswerProblems()).toEqual([]);
  });

  it('pin the correctly rounded square roots: each lies within half an ulp of the true root', () => {
    for (const [x, hex] of KNOWN_SQRT) {
      const r = fromBits(hex);
      expect(r > 0 && Number.isFinite(r), `${x}`).toBe(true);
      // The true root lies between the midpoints to the neighbouring doubles: (r⁻ + r)/2 ≤ √x ≤ (r + r⁺)/2.
      const lo = half(add(dyadic(step(r, -1)), dyadic(r)));
      const hi = half(add(dyadic(r), dyadic(step(r, 1))));
      const X = dyadic(x);
      expect(compare(square(lo), X), `√${x} is below ${hex}'s rounding interval`).toBeLessThanOrEqual(0);
      expect(compare(X, square(hi)), `√${x} is above ${hex}'s rounding interval`).toBeLessThanOrEqual(0);
    }
  });

  it('catch an engine whose square root is off by one bit', () => {
    const real = Math.sqrt;
    Math.sqrt = (x: number) => step(real(x), 1);
    try {
      const problems = knownAnswerProblems();
      expect(problems.filter((p) => p.startsWith('Math.sqrt(')).length).toBe(KNOWN_SQRT.length);
      expect(problems[0]).toBe(`Math.sqrt(2) is ${bitsOf(step(Math.SQRT2, 1))}, not 3ff6a09e667f3bcd`);
    } finally {
      Math.sqrt = real;
    }
    expect(knownAnswerProblems()).toEqual([]);
  });
});
