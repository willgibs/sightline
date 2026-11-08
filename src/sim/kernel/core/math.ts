import { datan2 } from './detmath';

/**
 * Small numeric helpers shared by the simulation and the renderer. Deterministic: only
 * exactly specified operations (see detmath.ts).
 */

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Moves `current` toward `target` by at most `maxDelta`. */
export function moveTowards(current: number, target: number, maxDelta: number): number {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

const PI = 3.141592653589793;
const TWO_PI = 6.283185307179586;

/** Wraps an angle into (-π, π]. */
export function wrapAngle(a: number): number {
  let r = a % TWO_PI;
  if (r <= -PI) r += TWO_PI;
  else if (r > PI) r -= TWO_PI;
  return r;
}

/** Turns `current` toward `target` by at most `maxDelta` radians along the short way. */
export function turnTowards(current: number, target: number, maxDelta: number): number {
  const d = wrapAngle(target - current);
  if (Math.abs(d) <= maxDelta) return wrapAngle(target);
  return wrapAngle(current + Math.sign(d) * maxDelta);
}

/**
 * Yaw convention (shared with three.js): yaw 0 faces north (-z) and increases turning
 * left, so forward = (-sin yaw, -cos yaw) and right = (cos yaw, -sin yaw).
 */
export function yawFromDirection(dx: number, dz: number): number {
  return datan2(-dx, -dz);
}

/** Compass heading in degrees, 0 = north, 90 = east. */
export function headingDegrees(yaw: number): number {
  const deg = (-yaw * 180) / PI;
  return ((deg % 360) + 360) % 360;
}

/** True if every component of a ray is a finite number: a ray that isn't hits nothing. */
export function finiteRay(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): boolean {
  return Number.isFinite(ox) && Number.isFinite(oy) && Number.isFinite(oz) && Number.isFinite(dx) && Number.isFinite(dy) && Number.isFinite(dz);
}
