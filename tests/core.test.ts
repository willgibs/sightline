import { describe, expect, it } from 'vitest';
import { FixedStepClock } from '../src/sim/kernel/core/clock';
import { circleDirections, datan, datan2, dcos, dexp, dlog, dpow, dsin } from '../src/sim/kernel/core/detmath';
import { Hasher, hashValue, stableStringify } from '../src/sim/kernel/core/hash';
import { headingDegrees, turnTowards, wrapAngle, yawFromDirection } from '../src/sim/kernel/core/math';
import { Rng } from '../src/sim/kernel/core/rng';
import { DEFAULT_SEED, isCanonicalSeed, normalizeSeed, randomSeed } from '../src/sim/kernel/core/seed';

describe('Rng', () => {
  it('repeats exactly for the same seed', () => {
    const a = new Rng('TAL-4471');
    const b = new Rng('TAL-4471');
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('differs between nearby seeds', () => {
    const a = new Rng('TAL-4471');
    const b = new Rng('TAL-4472');
    let same = 0;
    for (let i = 0; i < 100; i++) if (a.nextU32() === b.nextU32()) same++;
    expect(same).toBe(0);
  });

  it('forks independently of how much the parent has drawn', () => {
    const a = new Rng('KOR-1188');
    const b = new Rng('KOR-1188');
    for (let i = 0; i < 57; i++) b.next();
    const fa = a.fork('props');
    const fb = b.fork('props');
    for (let i = 0; i < 100; i++) expect(fa.next()).toBe(fb.next());
    expect(a.fork('props').next()).not.toBe(a.fork('trees').next());
  });

  it('stays in range and is roughly uniform', () => {
    const r = new Rng('uniform');
    let sum = 0;
    for (let i = 0; i < 20000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
      const k = r.int(3, 7);
      expect(k).toBeGreaterThanOrEqual(3);
      expect(k).toBeLessThanOrEqual(7);
    }
    expect(sum / 20000).toBeCloseTo(0.5, 1);
  });

  it('draws unit vectors without trigonometry', () => {
    const r = new Rng('unit');
    for (let i = 0; i < 500; i++) {
      const u = r.unit2();
      expect(Math.sqrt(u.x * u.x + u.z * u.z)).toBeCloseTo(1, 12);
    }
  });
});

describe('seeds', () => {
  it('normalizes typed seeds', () => {
    expect(normalizeSeed(' tal-4471 ')).toBe('TAL-4471');
    expect(normalizeSeed('tal4471')).toBe('TAL-4471');
    expect(normalizeSeed('')).toBe(DEFAULT_SEED);
    expect(normalizeSeed('my own valley')).toBe('my own valley');
  });

  it('makes pronounceable canonical seeds', () => {
    const r = new Rng('seeds');
    for (let i = 0; i < 50; i++) {
      const s = randomSeed(() => r.next());
      expect(isCanonicalSeed(s)).toBe(true);
      expect(s[1]).toMatch(/[AEIOU]/);
    }
  });
});

describe('deterministic math', () => {
  it('matches Math.sin and Math.cos closely', () => {
    for (let x = -20; x <= 20; x += 0.0137) {
      expect(Math.abs(dsin(x) - Math.sin(x))).toBeLessThan(1e-12);
      expect(Math.abs(dcos(x) - Math.cos(x))).toBeLessThan(1e-12);
    }
  });

  it('matches Math.atan and Math.atan2 closely, quadrants included', () => {
    for (let x = -50; x <= 50; x += 0.0731) expect(Math.abs(datan(x) - Math.atan(x))).toBeLessThan(1e-14);
    const r = new Rng('atan2');
    for (let k = 0; k < 5000; k++) {
      const y = r.range(-10, 10);
      const x = r.range(-10, 10);
      expect(Math.abs(datan2(y, x) - Math.atan2(y, x))).toBeLessThan(1e-14);
    }
    expect(datan2(0, -1)).toBeCloseTo(Math.PI, 15);
    expect(datan2(1, 0)).toBeCloseTo(Math.PI / 2, 15);
    expect(datan2(-1, 0)).toBeCloseTo(-Math.PI / 2, 15);
    expect(datan2(0, 0)).toBe(0);
  });

  it('matches Math.exp, Math.log and Math.pow closely', () => {
    const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);
    for (let x = -700; x <= 700; x += 0.0517) expect(rel(dexp(x), Math.exp(x))).toBeLessThan(1e-15);
    for (let p = -300; p <= 300; p += 0.0373) {
      const x = Math.pow(10, p);
      expect(Math.abs(dlog(x) - Math.log(x))).toBeLessThan(1e-15 * Math.max(1, Math.abs(Math.log(x))));
    }
    const r = new Rng('pow');
    for (let k = 0; k < 5000; k++) {
      const x = r.range(0.001, 50);
      const y = r.range(-6, 6);
      expect(rel(dpow(x, y), Math.pow(x, y))).toBeLessThan(1e-13);
    }
  });

  it('follows Math.exp, Math.log and Math.pow at the edges', () => {
    expect(dexp(0)).toBe(1);
    expect(dexp(710)).toBe(Infinity);
    expect(dexp(-746)).toBe(0);
    expect(dexp(709.7) / Math.exp(709.7)).toBeCloseTo(1, 14);
    expect(Number.isNaN(dexp(NaN))).toBe(true);
    expect(dlog(1)).toBe(0);
    expect(dlog(0)).toBe(-Infinity);
    expect(Number.isNaN(dlog(-1))).toBe(true);
    expect(dlog(5e-324)).toBeCloseTo(Math.log(5e-324), 10);
    expect(dpow(2, 10)).toBe(1024);
    expect(dpow(2, -2)).toBe(0.25);
    expect(dpow(-2, 3)).toBe(-8);
    expect(Number.isNaN(dpow(-2, 0.5))).toBe(true);
    expect(dpow(0, -1)).toBe(Infinity);
    expect(dpow(5, 0)).toBe(1);
  });

  it('builds evenly spaced unit directions', () => {
    const dirs = circleDirections(32);
    expect(dirs).toHaveLength(32);
    for (let i = 0; i < 32; i++) {
      const d = dirs[i]!;
      expect(Math.sqrt(d.x * d.x + d.z * d.z)).toBeCloseTo(1, 12);
      const a = (2 * Math.PI * i) / 32;
      expect(d.x).toBeCloseTo(Math.cos(a), 10);
      expect(d.z).toBeCloseTo(Math.sin(a), 10);
    }
  });
});

describe('hashing', () => {
  it('is stable and sensitive to every bit', () => {
    expect(new Hasher().f64(1).digest()).toBe(new Hasher().f64(1).digest());
    expect(new Hasher().f64(1).digest()).not.toBe(new Hasher().f64(1 + Number.EPSILON).digest());
  });

  it('ignores object key order', () => {
    expect(stableStringify({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe('{"a":[1,{"c":3,"d":2}],"b":1}');
    expect(hashValue({ x: 1, y: 2 })).toBe(hashValue({ y: 2, x: 1 }));
  });
});

describe('angles', () => {
  it('uses one yaw convention everywhere', () => {
    // yaw 0 faces north (-z); turning left increases yaw.
    expect(yawFromDirection(0, -1)).toBeCloseTo(0);
    expect(yawFromDirection(-1, 0)).toBeCloseTo(Math.PI / 2); // west
    expect(headingDegrees(0)).toBeCloseTo(0);
    expect(headingDegrees(-Math.PI / 2)).toBeCloseTo(90); // east
    expect(headingDegrees(Math.PI / 2)).toBeCloseTo(270); // west
  });

  it('wraps and turns the short way', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(turnTowards(3, -3, 0.1)).toBeCloseTo(3.1); // across the ±π seam
  });
});

describe('FixedStepClock', () => {
  it('runs exactly 30 ticks per second regardless of frame jitter', () => {
    const clock = new FixedStepClock(30);
    const r = new Rng('jitter');
    let ticks = 0;
    let elapsed = 0;
    while (elapsed < 10) {
      const frame = 0.004 + r.next() * 0.03;
      elapsed += frame;
      ticks += clock.advance(frame);
    }
    expect(Math.abs(ticks - elapsed * 30)).toBeLessThanOrEqual(1);
    expect(clock.alpha).toBeGreaterThanOrEqual(0);
    expect(clock.alpha).toBeLessThan(1);
  });

  it('drops long stalls instead of spiralling', () => {
    const clock = new FixedStepClock(30);
    expect(clock.advance(5)).toBeLessThanOrEqual(clock.maxTicksPerFrame);
  });
});
