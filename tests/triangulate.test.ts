import { describe, expect, it } from 'vitest';
import { Rng } from '../src/sim/kernel/core/rng';
import { dcos, dsin } from '../src/sim/kernel/core/detmath';
import { ellipseArea, emptyEstimate, fuseBearings, inEllipse, type Bearing, type FuseGrid } from '../src/sim/brain/triangulate';

/**
 * Triangulation (E8) is honest: across seeded shots, the commander's ellipse contains the
 * true perch about 39% of the time at one standard deviation and 86% at two (the
 * two-dimensional Gaussian rates), and it shrinks as evidence adds up.
 */

const SIGMA = (5 * Math.PI) / 180; // ±5°, the research's figure
const GRID: FuseGrid = { x: 0, z: 0, half: 720, cells: 120, rangeMin: 120, rangeMax: 480 };

/** Bearings from `listeners` guards toward the point (sx, sz), each with its own error. */
function bearings(rng: Rng, sx: number, sz: number, listeners: number, sigma = SIGMA): Bearing[] {
  const out: Bearing[] = [];
  for (let i = 0; i < listeners; i++) {
    const x = rng.range(-30, 30);
    const z = rng.range(-30, 30);
    const dx = sx - x;
    const dz = sz - z;
    const d = Math.sqrt(dx * dx + dz * dz);
    // A Gaussian bearing error, by Box-Muller from the listener's stream.
    const u = Math.max(1e-12, rng.next());
    const v = rng.next();
    const err = sigma * Math.sqrt(-2 * Math.log(u)) * dcos(2 * Math.PI * v);
    const c = dcos(err);
    const s = dsin(err);
    const ux = (dx / d) * c - (dz / d) * s;
    const uz = (dx / d) * s + (dz / d) * c;
    out.push({ x, z, ux, uz, sigma });
  }
  return out;
}

describe('triangulation', () => {
  it('states honest uncertainty: 39% and 86% at one and two sigma', () => {
    const rng = new Rng('TRI', 'shots');
    let in1 = 0;
    let in2 = 0;
    const N = 2000;
    const e = emptyEstimate();
    for (let k = 0; k < N; k++) {
      const a = rng.range(0, 2 * Math.PI);
      // Perches uniform over the ring the camp's prior assumes (uniform in area).
      const r = Math.sqrt(rng.next() * (GRID.rangeMax * GRID.rangeMax - GRID.rangeMin * GRID.rangeMin) + GRID.rangeMin * GRID.rangeMin);
      const sx = r * dcos(a);
      const sz = r * dsin(a);
      const bs = bearings(rng, sx, sz, 2 + (k % 5));
      fuseBearings(bs, GRID, e);
      if (inEllipse(e, sx, sz, 1)) in1++;
      if (inEllipse(e, sx, sz, 2)) in2++;
    }
    const p1 = in1 / N;
    const p2 = in2 / N;
    expect(p1).toBeGreaterThan(0.39 - 0.05);
    expect(p1).toBeLessThan(0.39 + 0.05);
    expect(p2).toBeGreaterThan(0.86 - 0.05);
    expect(p2).toBeLessThan(0.86 + 0.05);
  });

  it('shrinks with repeated shots from one place', () => {
    const rng = new Rng('TRI', 'repeat');
    const sx = 180;
    const sz = 120;
    const all: Bearing[] = [];
    const e = emptyEstimate();
    all.push(...bearings(rng, sx, sz, 3));
    fuseBearings(all, GRID, e);
    const first = ellipseArea(e);
    all.push(...bearings(rng, sx, sz, 3));
    fuseBearings(all, GRID, e);
    const second = ellipseArea(e);
    all.push(...bearings(rng, sx, sz, 3));
    fuseBearings(all, GRID, e);
    const third = ellipseArea(e);
    expect(second).toBeLessThan(first * 0.75);
    expect(third).toBeLessThan(second * 0.85);
  });

  it('a lone bearing is an estimate too: "along here", not at infinity', () => {
    const rng = new Rng('TRI', 'one');
    const e = emptyEstimate();
    fuseBearings(bearings(rng, 300, 0, 1), GRID, e);
    expect(Number.isFinite(e.x)).toBe(true);
    expect(ellipseArea(e)).toBeGreaterThan(1000);
  });
});
