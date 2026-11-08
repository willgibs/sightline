import type { Tuning } from '../../config/tuning';
import { dlog } from '../kernel/core/detmath';

/**
 * The one ballistic function: where a bullet is at any instant after it leaves, from its
 * launch alone. The bullet, the zero dial, the reticle's holds, the rangefinder's readout
 * and every assist evaluate this and nothing else, so no instrument can disagree with a
 * bullet (docs/decisions.md, Lab B).
 *
 * The model is realistic-lite: gravity, one quadratic drag constant per load
 * (a = −k·|v|·v), and the mission's steady wind. It is solved in closed form, exactly, at
 * any time, needing only dlog and division, so nothing integrates and nothing drifts:
 *
 *   along the bore    u(τ) = ln(1 + s·τ)/k − ½·g·sin θ·τ²,   s = k·v₀
 *   across it, up     w(τ) = −g·cos θ·(τ²/4 + (τ/s − ln(1 + s·τ)/s²)/2)
 *   the wind's push   W·(τ − ln(1 + s·τ)/(k·v₀))              (the lag rule)
 *
 * where θ is the bore's elevation and τ the time since launch. Drop on g·cos θ is the
 * rifleman's rule; the along-bore gravity term keeps the timing right on slopes. Against
 * a numerical integration of the same model, the error across the line of aim stays
 * under 0.05 cm on ±30° slopes out to 500 m, and against a G7 point-mass solver for the
 * match load, drop stays within 1 cm (tests/ballistics.test.ts). Carrying the bullet with
 * the air instead of the lag rule would overstate drift six to nine times.
 *
 * Units are metres, seconds and radians; positions are in the world frame (y up).
 */

/** A bullet's launch: everything its path depends on. Plain data, kept in the state. */
export interface Flight {
  /** Where it left: the shooter's eye. */
  x: number;
  y: number;
  z: number;
  /** Unit direction it left in: the bore's line, not the line of sight. */
  dx: number;
  dy: number;
  dz: number;
  /** When it left, mission seconds. */
  t: number;
  /** Muzzle speed, m/s. */
  v0: number;
  /** Drag constant at the mission's air, per metre. */
  k: number;
  /** Gravity, m/s². */
  g: number;
  /** The wind's velocity, m/s (horizontal). */
  wx: number;
  wz: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function vec3(): Vec3 {
  return { x: 0, y: 0, z: 0 };
}

/** A load's drag constant in the mission's air: drag scales with the air's density. */
export function dragIn(load: { drag: number }, density: number, B: Tuning['ballistics']): number {
  return (load.drag * density) / B.airDensity;
}

/**
 * The bore's frame: its elevation's sine and cosine, and the unit vector across the bore
 * in its vertical plane, pointing up. A bore pointing straight up or down has no vertical
 * plane; any horizontal "up" serves, since gravity then acts along the bore.
 */
interface Frame {
  sin: number;
  cos: number;
  nx: number;
  ny: number;
  nz: number;
}

const frame: Frame = { sin: 0, cos: 1, nx: 0, ny: 1, nz: 0 };

function boreFrame(f: Flight, out: Frame): Frame {
  const sin = f.dy;
  const cos = Math.sqrt(f.dx * f.dx + f.dz * f.dz);
  out.sin = sin;
  out.cos = cos;
  if (cos > 1e-9) {
    out.nx = (-f.dx * sin) / cos;
    out.ny = cos;
    out.nz = (-f.dz * sin) / cos;
  } else {
    out.nx = 1;
    out.ny = 0;
    out.nz = 0;
  }
  return out;
}

/** Distance along the bore from drag alone, ln(1 + s·τ)/k: v₀·τ in a vacuum. */
function dragDistance(f: Flight, tau: number): number {
  const s = f.k * f.v0;
  return s > 1e-12 ? dlog(1 + s * tau) / f.k : f.v0 * tau;
}

/** The drop across the bore before g·cos θ: τ²/4 + (τ/s − ln(1 + s·τ)/s²)/2, τ²/2 in a vacuum. */
function dropShape(f: Flight, tau: number): number {
  const s = f.k * f.v0;
  if (s * tau < 1e-6) return (tau * tau) / 2 - (s * tau * tau * tau) / 6;
  return (tau * tau) / 4 + (tau / s - dlog(1 + s * tau) / (s * s)) / 2;
}

/** Where the bullet is at mission time `t` (no earlier than its launch), written to `out`. */
export function flightAt(f: Flight, t: number, out: Vec3): Vec3 {
  const tau = t > f.t ? t - f.t : 0;
  const fr = boreFrame(f, frame);
  const u0 = dragDistance(f, tau);
  const u = u0 - 0.5 * f.g * fr.sin * tau * tau;
  const w = -f.g * fr.cos * dropShape(f, tau);
  const lag = tau - u0 / f.v0;
  out.x = f.x + f.dx * u + fr.nx * w + f.wx * lag;
  out.y = f.y + f.dy * u + fr.ny * w;
  out.z = f.z + f.dz * u + fr.nz * w + f.wz * lag;
  return out;
}

/** The bullet's velocity at mission time `t`, m/s, written to `out`. */
export function velocityAt(f: Flight, t: number, out: Vec3): Vec3 {
  const tau = t > f.t ? t - f.t : 0;
  const fr = boreFrame(f, frame);
  const s = f.k * f.v0;
  const along = f.v0 / (1 + s * tau) - f.g * fr.sin * tau;
  const across = (-f.g * fr.cos * (tau + (s * tau * tau) / 2)) / (1 + s * tau);
  const lag = (s * tau) / (1 + s * tau);
  out.x = f.dx * along + fr.nx * across + f.wx * lag;
  out.y = f.dy * along + fr.ny * across;
  out.z = f.dz * along + fr.nz * across + f.wz * lag;
  return out;
}

/** The bullet's speed through the air (relative to the wind) at mission time `t`, m/s: what sets its crack. */
export function airspeedAt(f: Flight, t: number): number {
  const tau = t > f.t ? t - f.t : 0;
  // Along the path, drag alone sets the speed through the air; gravity bends the path and adds little.
  return f.v0 / (1 + f.k * f.v0 * tau);
}

const p = vec3();

/**
 * When the bullet has come `range` metres along a line from its launch point (a unit
 * direction), mission seconds: when it crosses the plane square to that line at that
 * distance. Bisection with a fixed number of halvings (rule 18), bracketed by the
 * flight's longest time. Infinity if it never gets there within `maxTime` seconds.
 */
export function timeAtRange(f: Flight, lx: number, ly: number, lz: number, range: number, maxTime: number): number {
  const along = (t: number): number => {
    flightAt(f, t, p);
    return (p.x - f.x) * lx + (p.y - f.y) * ly + (p.z - f.z) * lz;
  };
  let lo = f.t;
  let hi = f.t + maxTime;
  if (along(hi) < range) return Infinity;
  for (let k = 0; k < 64; k++) {
    const mid = (lo + hi) / 2;
    if (along(mid) < range) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
