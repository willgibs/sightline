import { describe, expect, it, vi } from 'vitest';

/**
 * The exact range reduction for |x| ≥ 10⁶ (D1, kernel/core/detmath.ts). Both dsin and dcos
 * drive the simulation as well as generation, so besides being right, the switch must be
 * unreachable from anything a run computes: the math golden and every recording depend on
 * the plain reduction below 10⁶ staying bit for bit what it was.
 */

/** Every argument the simulation and generation hand to the trigonometry, while this file runs. */
const seen = { max: 0, calls: 0 };

vi.mock('../src/sim/kernel/core/detmath', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/sim/kernel/core/detmath')>();
  const note = (x: number): void => {
    seen.calls++;
    if (Math.abs(x) > seen.max) seen.max = Math.abs(x);
  };
  return {
    ...real,
    dsin: (x: number) => (note(x), real.dsin(x)),
    dcos: (x: number) => (note(x), real.dcos(x)),
    dcosDeg: (deg: number) => (note(deg * real.DEG), real.dcosDeg(deg)),
    dtanDeg: (deg: number) => (note(deg * real.DEG), real.dtanDeg(deg)),
  };
});

const { DEG, TWO_OVER_PI, dcos, dsin } = await import('../src/sim/kernel/core/detmath');

/** 2/π in 24-bit limbs, from Machin's formula in exact integer arithmetic. */
function twoOverPiLimbs(count: number): number[] {
  const B = BigInt(24 * count + 64);
  const one = 1n << B;
  const atanInv = (n: bigint): bigint => {
    let sum = 0n;
    let term = one / n;
    let k = 1n;
    let sign = 1n;
    while (term !== 0n) {
      sum += (sign * term) / k;
      term /= n * n;
      k += 2n;
      sign = -sign;
    }
    return sum;
  };
  const pi = 16n * atanInv(5n) - 4n * atanInv(239n);
  const value = (2n * one * one) / pi;
  return Array.from({ length: count }, (_, k) => Number((value >> (B - 24n * BigInt(k + 1))) & 0xffffffn));
}

/** A double from its sign, its 52-bit fraction as two parts, and its exponent. */
function double(hi20: number, lo32: number, exponent: number): number {
  const v = new DataView(new ArrayBuffer(8));
  v.setUint32(0, (((exponent + 1023) & 0x7ff) << 20) | (hi20 & 0xfffff), false);
  v.setUint32(4, lo32 >>> 0, false);
  return v.getFloat64(0, false);
}

describe('the exact range reduction', () => {
  it('uses the true bits of 2/π', () => {
    expect([...TWO_OVER_PI]).toEqual(twoOverPiLimbs(TWO_OVER_PI.length));
  });

  it("agrees with the engine's own sin and cos for huge arguments, which the plain reduction gets wrong", () => {
    // Engines reduce exactly (fdlibm's Payne–Hanek), so this compares like with like. The
    // tolerance is the kernels' own error on [−π/4, π/4], about 1.1e-15 against the engine's,
    // so the reduction adds nothing of its own.
    let worst = 0;
    let state = 0x9e3779b9;
    const next = (): number => {
      state = Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) >>> 0;
      state = (state ^ Math.imul(state ^ (state >>> 12), 0x297a2d39)) >>> 0;
      return (state ^ (state >>> 15)) >>> 0;
    };
    for (let k = 0; k < 4000; k++) {
      const exponent = 20 + (next() % 1003); // 2^20 to 2^1022
      const x = double(next(), next(), exponent) * (next() & 1 ? -1 : 1);
      worst = Math.max(worst, Math.abs(dsin(x) - Math.sin(x)), Math.abs(dcos(x) - Math.cos(x)));
    }
    expect(worst).toBeLessThan(1.5e-15);
    // The hardest double to reduce: within 2^-61 of a multiple of π/2 (Kahan and McDonald).
    const hard = 6381956970095103 * 2 ** 797;
    expect(Math.abs(dsin(hard) - Math.sin(hard))).toBeLessThan(1.5e-15 * Math.abs(Math.sin(hard)));
    expect(dsin(1e22)).toBeCloseTo(-0.8522008497671888, 15);
    expect(dcos(1e22)).toBeCloseTo(0.5232147853951389, 15);
    for (const x of [1e6, -1e6, 2 ** 30, 1e300, Number.MAX_VALUE]) {
      expect(Math.abs(dsin(x) - Math.sin(x))).toBeLessThan(1.5e-15);
      expect(Math.abs(dcos(x) - Math.cos(x))).toBeLessThan(1.5e-15);
    }
    expect(dsin(Infinity)).toBeNaN();
    expect(dcos(-Infinity)).toBeNaN();
    expect(dsin(NaN)).toBeNaN();
  });

  it('starts at 10⁶ and leaves everything below it as it was', () => {
    // Below 10⁶, x = k·π/2 + r with r = x − k·HALF_PI, exactly as before: the answer is the
    // kernel's at r, which is what dsin and dcos give for an r that needs no reduction.
    const plain = (x: number, f: 'sin' | 'cos'): number => {
      const k = Math.floor(x / (Math.PI / 2) + 0.5);
      const r = x - k * (Math.PI / 2);
      const q = (((k % 4) + 4) % 4 + (f === 'cos' ? 1 : 0)) % 4;
      return q === 0 ? dsin(r) : q === 1 ? dcos(r) : q === 2 ? -dsin(r) : -dcos(r);
    };
    for (const x of [999999.9999999999, -999999.25, 123456.789, 54321.5, 3.25, -0.5]) {
      expect(dsin(x)).toBe(plain(x, 'sin'));
      expect(dcos(x)).toBe(plain(x, 'cos'));
    }
    // From 10⁶ up the plain reduction drifts with the size of x, and the exact one doesn't.
    const x = 1e15 + 0.125;
    expect(Math.abs(plain(x, 'sin') - Math.sin(x))).toBeGreaterThan(1e-3);
    expect(Math.abs(dsin(x) - Math.sin(x))).toBeLessThan(1.5e-15);
  });

  it('is never reached by generation or by any pinned run', async () => {
    const { defaultTuning } = await import('../src/config/tuning');
    const { generateWorld } = await import('../src/sim/generation');
    const { missionSpec } = await import('../src/sim/kernel/mission');
    const { PINNED_RUNS, runFingerprint } = await import('../src/sim/game/runs');
    seen.max = 0;
    seen.calls = 0;
    for (const seed of ['TAL-4471', 'MUD-9031']) generateWorld(missionSpec(seed), defaultTuning);
    for (const run of PINNED_RUNS) runFingerprint(run);
    expect(seen.calls).toBeGreaterThan(10000);
    expect(seen.max).toBeLessThan(1e6);
    // The one argument that grows with time: a guard's head sweep, 2π(t / period + phase).
    // It reaches 10⁶ only after 10⁶ / 2π periods, almost thirteen days of mission.
    const shortest = defaultTuning.gen.routines.headScanPeriod;
    const seconds = (1e6 / (2 * Math.PI) - 1) * shortest;
    expect(seconds / 86400).toBeGreaterThan(12);
    expect(DEG).toBe(Math.PI / 180);
  }, 120_000);
});
