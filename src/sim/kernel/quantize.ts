import { clamp, wrapAngle } from './core/math';

/**
 * How input values are rounded to what a recording stores. Every quantizer is
 * idempotent, bit for bit: quantizing a quantized value changes nothing, which is what
 * makes a recorded value replay as itself. Non-finite values never get through, because
 * NaN would replay differently and its bits differ between engines.
 */

const PI = 3.141592653589793;
const TWO_PI = 6.283185307179586;

/** An axis in [−1, 1] to the nearest 1/127. Adding 0 turns −0 into +0, which a byte can't store. */
export function quantAxis(v: number): number {
  return Math.round(clamp(Number.isFinite(v) ? v : 0, -1, 1) * 127) / 127 + 0;
}

/**
 * A yaw to 32 bits within (−π, π]. Rounding to 32 bits can land just outside the range
 * (fround(π) is above π), and re-wrapping that on replay would give different bits, so
 * an out-of-range result is folded back and rounded again.
 */
export function quantYaw(a: number): number {
  let v = Math.fround(wrapAngle(Number.isFinite(a) ? a : 0));
  if (v > PI) v = Math.fround(v - TWO_PI);
  else if (v <= -PI) v = Math.fround(v + TWO_PI);
  return v;
}

/** A pitch to 32 bits within [−1.5, 1.5]. */
export function quantPitch(a: number): number {
  return Math.fround(clamp(Number.isFinite(a) ? a : 0, -1.5, 1.5));
}
