import { describe, expect, it } from 'vitest';
import { defaultTuning } from '../src/config/tuning';
import { FixedStepClock } from '../src/sim/core/clock';
import { datan2, dtanDeg } from '../src/sim/core/detmath';
import { Hasher } from '../src/sim/core/hash';
import { Rng } from '../src/sim/core/rng';
import { neutralInput, quantizeInput, type InputFrame } from '../src/sim/input';
import { quantYaw } from '../src/sim/quantize';
import { missionSpec } from '../src/sim/mission';
import { ByteWriter } from '../src/sim/record/bytes';
import { Recorder, Recording } from '../src/sim/record/recording';
import { resimulate } from '../src/sim/record/resim';
import { Simulation } from '../src/sim/sim';
import { testWorld } from './fixtures';

/**
 * Edge cases found by the determinism audit, each pinned so it can't come back.
 */

const bitsOf = (v: number): string => {
  const d = new DataView(new ArrayBuffer(8));
  d.setFloat64(0, v);
  return `${d.getUint32(0).toString(16)}:${d.getUint32(4).toString(16)}`;
};

function nextUp(v: number): number {
  const d = new DataView(new ArrayBuffer(8));
  d.setFloat64(0, v);
  const hi = d.getUint32(0);
  const lo = d.getUint32(4);
  if (v >= 0) {
    if (lo === 0xffffffff) d.setUint32(0, hi + 1), d.setUint32(4, 0);
    else d.setUint32(4, lo + 1);
  } else if (lo === 0) d.setUint32(0, hi - 1), d.setUint32(4, 0xffffffff);
  else d.setUint32(4, lo - 1);
  return d.getFloat64(0);
}

describe('input quantization', () => {
  it('is idempotent bit for bit, including right at ±π', () => {
    const r = new Rng('quant');
    const samples = [Math.PI, -Math.PI, nextUp(Math.PI), -nextUp(Math.PI), Math.fround(Math.PI), -Math.fround(Math.PI), 3 * Math.PI, -5 * Math.PI];
    for (let i = 0; i < 2000; i++) samples.push(Math.PI - i * 1e-11, -Math.PI + i * 1e-11, r.range(-10, 10));
    for (const yaw of samples) {
      const once = quantYaw(yaw);
      expect(bitsOf(quantYaw(once))).toBe(bitsOf(once));
      expect(once).toBeGreaterThan(-Math.PI);
      expect(once).toBeLessThanOrEqual(Math.PI);
    }
  });

  it('records a south-facing run that replays exactly', () => {
    const world = testWorld();
    const sim = new Simulation(world, defaultTuning);
    const rec = new Recorder(sim);
    for (let i = 0; i < 400; i++) {
      const f: InputFrame = { ...neutralInput(i < 200 ? Math.PI : -Math.PI), moveZ: 1 };
      rec.record(sim, sim.step(f));
    }
    const back = Recording.fromBytes(rec.finish(sim).toBytes());
    expect(resimulate(back, world).ok).toBe(true);
  });

  it('keeps non-finite numbers out of the simulation', () => {
    const out = neutralInput(0.5, 0.1);
    quantizeInput({ moveX: NaN, moveZ: Infinity, sprint: false, crouch: false, prone: false, yaw: Infinity, pitch: NaN }, out);
    expect(out.moveX).toBe(0);
    expect(out.moveZ).toBe(0); // non-finite axes become 0, like a released key
    expect(out.yaw).toBe(Math.fround(0.5)); // the previous yaw is kept
    expect(out.pitch).toBe(Math.fround(0.1));
    // A tiny negative axis rounds to +0, which is what a recording can store.
    quantizeInput({ ...neutralInput(), moveX: -0.003 }, out);
    expect(Object.is(out.moveX, 0)).toBe(true);
  });
});

describe('hashing', () => {
  it('hashes every NaN alike, whatever its bits', () => {
    const d = new DataView(new ArrayBuffer(8));
    d.setUint32(0, 0xfff80000);
    d.setUint32(4, 0);
    const negativeNaN = d.getFloat64(0);
    d.setUint32(0, 0x7ff80001);
    const payloadNaN = d.getFloat64(0);
    const h = (v: number) => new Hasher().f64(v).digest();
    expect(h(negativeNaN)).toBe(h(NaN));
    expect(h(payloadNaN)).toBe(h(NaN));
  });
});

describe('deterministic math at the edges', () => {
  it('makes 90° infinitely steep, not negative', () => {
    expect(dtanDeg(90)).toBe(Infinity);
    expect(dtanDeg(-90)).toBe(-Infinity);
    expect(dtanDeg(45)).toBeCloseTo(1, 14);
  });

  it('propagates NaN and handles infinities like Math.atan2', () => {
    expect(Number.isNaN(datan2(NaN, 1))).toBe(true);
    expect(Number.isNaN(datan2(1, NaN))).toBe(true);
    expect(Number.isNaN(datan2(NaN, NaN))).toBe(true);
    for (const [y, x] of [[Infinity, Infinity], [Infinity, -Infinity], [-Infinity, Infinity], [-Infinity, -Infinity], [Infinity, 3], [-Infinity, 3], [2, Infinity], [2, -Infinity]] as const) {
      expect(datan2(y, x)).toBeCloseTo(Math.atan2(y, x), 15);
    }
  });
});

describe('random streams', () => {
  it('refuses fork labels that could collide with a nested fork', () => {
    const r = new Rng('x');
    expect(() => r.fork('props/trees')).toThrow(/separator/);
    expect(() => r.fork('props').fork('trees')).not.toThrow();
  });
});

describe('small guards', () => {
  it('grows a byte writer that started empty', () => {
    const w = new ByteWriter(0);
    for (let i = 0; i < 100; i++) w.u8(i);
    expect(w.length).toBe(100);
  });

  it('treats a NaN frame time as no time at all', () => {
    const c = new FixedStepClock(30);
    expect(c.advance(NaN)).toBe(0);
    expect(c.advance(1 / 30 + 1e-9)).toBe(1);
    expect(Number.isFinite(c.alpha)).toBe(true);
  });
});

describe('the fixture spawn', () => {
  it('builds the world from a spec like generation does', () => {
    expect(testWorld().spec).toEqual(missionSpec('TEST-0000', 'edge'));
  });
});

describe('tuning validation', () => {
  it('accepts the defaults', async () => {
    const { tuningProblems } = await import('../src/config/validate');
    expect(tuningProblems(defaultTuning)).toEqual([]);
  });

  it('rejects numbers a recording could not carry, and sizes that would hang generation', async () => {
    const { tuningProblems } = await import('../src/config/validate');
    const bad = (edit: (t: typeof defaultTuning) => void): string[] => {
      const t = structuredClone(defaultTuning);
      edit(t);
      return tuningProblems(t);
    };
    expect(bad((t) => (t.bodies.player.accel = Infinity))).toEqual(['tuning.bodies.player.accel is Infinity']);
    expect(bad((t) => (t.bodies.player.decel = NaN))).toEqual(['tuning.bodies.player.decel is NaN']);
    expect(bad((t) => (t.bodies.player.accel = -0))).toEqual(['tuning.bodies.player.accel is -0']);
    expect(bad((t) => (t.gen.props.treeSpacing = 0))[0]).toMatch(/treeSpacing is 0/);
    expect(bad((t) => (t.gen.world.size = 40000))[0]).toMatch(/size is 40000/);
    expect(bad((t) => (t.gen.world.maxGenAttempts = 1e308))[0]).toMatch(/maxGenAttempts/);
    expect(bad((t) => ((t.bodies.player as Record<string, unknown>).extra = 1))).toEqual(['tuning.bodies.player.extra is not a tuning value']);
    expect(bad((t) => delete (t.noise as Partial<typeof t.noise>).radiusPerUnit)).toEqual(['tuning.noise.radiusPerUnit is missing']);
  });

  it('refuses a recording whose header was tampered with', () => {
    const world = testWorld();
    const sim = new Simulation(world, defaultTuning);
    const rec = new Recorder(sim);
    for (let i = 0; i < 60; i++) rec.record(sim, sim.step(neutralInput()));
    const good = rec.finish(sim);
    const tamper = (edit: (h: Record<string, unknown>) => void): Uint8Array => {
      const h = structuredClone(good.header) as unknown as Record<string, unknown>;
      edit(h);
      return new Recording(h as never, good.tracks).toBytes();
    };
    expect(() => Recording.fromBytes(good.toBytes())).not.toThrow();
    expect(() => Recording.fromBytes(tamper((h) => ((h.tuning as typeof defaultTuning).gen.props.treeSpacing = 0)))).toThrow(/treeSpacing/);
    expect(() => Recording.fromBytes(tamper((h) => ((h.tuning as { bodies: { player: Record<string, unknown> } }).bodies.player.walk = 99)))).toThrow(
      /made by .*whose tuning differs from this one's \(tuning\.bodies\.player\.walk is not a tuning value\)/,
    );
    expect(() => Recording.fromBytes(tamper((h) => ((h.tuning as typeof defaultTuning).bodies.guard.maxSlopeDeg = 95)))).toThrow(
      /Corrupt recording: Invalid tuning: bodies\.guard\.maxSlopeDeg is 95, outside 1–89/,
    );
    expect(() => Recording.fromBytes(tamper((h) => ((h.tuning as typeof defaultTuning).bodies.player.speed.walk = 3.5)))).toThrow(/does not match its hash/);
    expect(() => Recording.fromBytes(tamper((h) => (h.ticks = 1e9)))).toThrow(/ticks in/);
    expect(() => Recording.fromBytes(tamper((h) => (h.ticks = 59)))).toThrow(/Corrupt recording/);
  });
});
