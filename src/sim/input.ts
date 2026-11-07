import { clamp, wrapAngle } from './core/math';

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
 */
export function quantizeInput(f: InputFrame, out: InputFrame = neutralInput()): InputFrame {
  out.moveX = Math.round(clamp(f.moveX, -1, 1) * 127) / 127;
  out.moveZ = Math.round(clamp(f.moveZ, -1, 1) * 127) / 127;
  out.sprint = f.sprint;
  out.crouch = f.crouch;
  out.prone = f.prone;
  out.yaw = Math.fround(wrapAngle(f.yaw));
  out.pitch = Math.fround(clamp(f.pitch, -1.5, 1.5));
  return out;
}

export function inputFlags(f: InputFrame): number {
  return (f.sprint ? InputFlag.Sprint : 0) | (f.crouch ? InputFlag.Crouch : 0) | (f.prone ? InputFlag.Prone : 0);
}
