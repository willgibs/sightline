import { clamp, wrapAngle } from './core/math';

const PI = 3.141592653589793;
const TWO_PI = 6.283185307179586;

/**
 * One tick of player intent. The browser builds these from keyboard and mouse; bots and
 * tests build them directly; recordings store them so a mission can be re-simulated.
 */
export interface InputFrame {
  /** Strafe, -1 (left) to 1 (right). */
  moveX: number;
  /** Forward/back, -1 (back) to 1 (forward). */
  moveZ: number;
  sprint: boolean;
  /** Stance toggles requested this tick (edge-triggered). */
  crouch: boolean;
  prone: boolean;
  /** View angles in radians (see math.ts for the yaw convention). */
  yaw: number;
  pitch: number;
}

export const InputFlag = { Sprint: 1, Crouch: 2, Prone: 4 } as const;

export function neutralInput(yaw = 0, pitch = 0): InputFrame {
  return { moveX: 0, moveZ: 0, sprint: false, crouch: false, prone: false, yaw, pitch };
}

/**
 * Snaps an input to exactly what a recording stores (8-bit movement axes, 32-bit
 * angles). The live game feeds the simulation quantized input too, so playing a mission
 * and re-simulating its recording see identical numbers and stay in lockstep.
 *
 * Quantizing is idempotent, bit for bit: quantizing a quantized frame changes nothing.
 * That is what makes a recorded value replay as itself. Non-finite values never get in:
 * an axis becomes 0 and an angle keeps its previous value (`out` holds the last frame),
 * because NaN would replay differently and its bits differ between engines.
 */
export function quantizeInput(f: InputFrame, out: InputFrame = neutralInput()): InputFrame {
  out.moveX = quantAxis(f.moveX);
  out.moveZ = quantAxis(f.moveZ);
  out.sprint = f.sprint === true;
  out.crouch = f.crouch === true;
  out.prone = f.prone === true;
  out.yaw = quantYaw(Number.isFinite(f.yaw) ? f.yaw : out.yaw);
  out.pitch = Math.fround(clamp(Number.isFinite(f.pitch) ? f.pitch : out.pitch, -1.5, 1.5));
  return out;
}

/** An axis to the nearest 1/127. Adding 0 turns −0 into +0, which a byte can't store. */
function quantAxis(v: number): number {
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

export function inputFlags(f: InputFrame): number {
  return (f.sprint ? InputFlag.Sprint : 0) | (f.crouch ? InputFlag.Crouch : 0) | (f.prone ? InputFlag.Prone : 0);
}
