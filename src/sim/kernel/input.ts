import { MAX_COMMANDS, quantizeCommand, type Command } from './commands';
import { quantAxis, quantPitch, quantYaw } from './quantize';

/**
 * One tick of player input. The browser builds these from keyboard and mouse; bots and
 * tests build them directly; recordings store them so a mission can be re-simulated.
 *
 * Three kinds of thing: continuous controls (movement axes, view angles), held states
 * (sprint, an optic up, breath held, a lean), and discrete events: stance toggles and
 * commands (commands.ts), which say exactly when within the frames on screen they happened.
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
  /** The optic held up (Optic). Default none. */
  optic?: number;
  /** Breath held to steady the aim. */
  breath?: boolean;
  /** Leaning left (−1) or right (1). */
  lean?: number;
  /** Discrete actions this tick, usually none. */
  commands?: readonly Command[];
}

/** An InputFrame as the simulation runs it: quantized, with every field present. */
export interface TickInput extends InputFrame {
  optic: Optic;
  breath: boolean;
  lean: -1 | 0 | 1;
  commands: Command[];
}

export const Optic = { None: 0, Scope: 1, Binoculars: 2 } as const;
export type Optic = (typeof Optic)[keyof typeof Optic];

export const InputFlag = { Sprint: 1, Crouch: 2, Prone: 4 } as const;

export function neutralInput(yaw = 0, pitch = 0): TickInput {
  return { moveX: 0, moveZ: 0, sprint: false, crouch: false, prone: false, yaw, pitch, optic: Optic.None, breath: false, lean: 0, commands: [] };
}

/**
 * Snaps an input to exactly what a recording stores (8-bit movement axes, 32-bit
 * angles, quantized commands). The live game feeds the simulation quantized input too,
 * so playing a mission and re-simulating its recording see identical numbers and stay
 * in lockstep.
 *
 * Quantizing is idempotent, bit for bit: quantizing a quantized frame changes nothing.
 * Non-finite values never get in: an axis becomes 0 and an angle keeps its previous
 * value (`out` holds the last frame), because NaN would replay differently and its bits
 * differ between engines.
 */
export function quantizeInput(f: InputFrame, out: TickInput = neutralInput()): TickInput {
  out.moveX = quantAxis(f.moveX);
  out.moveZ = quantAxis(f.moveZ);
  out.sprint = f.sprint === true;
  out.crouch = f.crouch === true;
  out.prone = f.prone === true;
  out.yaw = quantYaw(Number.isFinite(f.yaw) ? f.yaw : out.yaw);
  out.pitch = quantPitch(Number.isFinite(f.pitch) ? f.pitch : out.pitch);
  out.optic = f.optic === Optic.Scope || f.optic === Optic.Binoculars ? f.optic : Optic.None;
  out.breath = f.breath === true;
  out.lean = f.lean === -1 || f.lean === 1 ? f.lean : 0;
  out.commands.length = 0;
  const commands = f.commands ?? [];
  for (let k = 0; k < commands.length && k < MAX_COMMANDS; k++) out.commands.push(quantizeCommand(commands[k]!));
  return out;
}

export function inputFlags(f: InputFrame): number {
  return (f.sprint ? InputFlag.Sprint : 0) | (f.crouch ? InputFlag.Crouch : 0) | (f.prone ? InputFlag.Prone : 0);
}

/** The held states in one byte: optic in bits 0–1, breath in bit 2, lean in bits 3–4 (1 left, 2 right). */
export function heldByte(f: TickInput): number {
  return f.optic | (f.breath ? 4 : 0) | (f.lean === -1 ? 8 : f.lean === 1 ? 16 : 0);
}

export function fromHeldByte(b: number, out: TickInput): void {
  const optic = b & 3;
  out.optic = optic === Optic.Scope || optic === Optic.Binoculars ? optic : Optic.None;
  out.breath = (b & 4) !== 0;
  out.lean = b & 8 ? -1 : b & 16 ? 1 : 0;
}
