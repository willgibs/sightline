import type { CodeRange } from './codes';
import { clamp } from './core/math';
import { quantPitch, quantYaw } from './quantize';

/**
 * Commands: discrete things the player does, carried in the tick's input alongside the
 * held keys. Most are simple (cycle the bolt). Precise ones carry what the player saw
 * when they acted, so a shot between ticks goes where the crosshair was:
 *
 *   lag    how many ticks before the consuming tick's start state the moment was, in
 *          [0, 2]. The screen draws between the last two states, so a click on a frame
 *          drawn at fraction α between ticks N − 1 and N, consumed by tick N + 1, has a
 *          lag of 1 − α.
 *   yaw, pitch  the view angles of that frame (mouse look runs at frame rate).
 *
 * The simulation resolves a precise command against its pose history (body/body.ts),
 * so what it computes matches what was on screen, at any frame rate.
 *
 * Adding a command: add it to Command and to COMMANDS with a new code from your lane's
 * range (codes.ts). Its fields are quantized by their codec, so live play and
 * re-simulation see the same numbers.
 */

export interface FireCommand {
  kind: 'fire';
  lag: number;
  yaw: number;
  pitch: number;
}

/** Mantle or take a ladder, if one is in front (lab C, body/mantle.ts). */
export interface ClimbCommand {
  kind: 'climb';
}

/** The use action: pick up what's in reach, or put it down (lab C, game/use.ts). */
export interface UseCommand {
  kind: 'use';
}

/**
 * Sandbox (A10): drop a noise where the player looks, from the debug view. It carries the
 * moment and the view of the frame clicked, like a shot, so it lands where the aim was.
 */
export interface NoiseCommand {
  kind: 'noise';
  lag: number;
  yaw: number;
  pitch: number;
}

/** Sandbox (A9): drop a body where the player looks, as a noise is dropped. It lies already down. */
export interface BodyDropCommand {
  kind: 'bodyDrop';
  lag: number;
  yaw: number;
  pitch: number;
}

/** Laser the range along the frame's line of sight, with the binoculars up (ballistics lane). */
export interface RangeCommand {
  kind: 'range';
  lag: number;
  yaw: number;
  pitch: number;
}

/** Throw the throwable along the frame's line of sight (ballistics lane). */
export interface ThrowCommand {
  kind: 'throw';
  lag: number;
  yaw: number;
  pitch: number;
}

/**
 * Sandbox (the debug view): a shot dropped where the frame's line of sight meets the world,
 * fired from the eye whether or not a rifle is carried (ballistics lane).
 */
export interface ShotDropCommand {
  kind: 'shotDrop';
  lag: number;
  yaw: number;
  pitch: number;
}

/**
 * The compound simulator (Lab F): something happens at a place in the world with nobody
 * there to do it. `what` indexes the game's list of stimuli (game/drops.ts).
 */
export interface StimulusCommand {
  kind: 'stimulus';
  what: number;
  x: number;
  y: number;
  z: number;
  fromX: number;
  fromY: number;
  fromZ: number;
}

/** One click of the scope's zero dial, up or down; fit or take off the suppressor. */
export interface ZeroUpCommand {
  kind: 'zeroUp';
}
export interface ZeroDownCommand {
  kind: 'zeroDown';
}
export interface SuppressorCommand {
  kind: 'suppressor';
}
/** Change the load in the rifle for the next one it carries. */
export interface LoadCommand {
  kind: 'load';
}

export type Command = StimulusCommand | FireCommand | NoiseCommand | BodyDropCommand | RangeCommand | ThrowCommand | ZeroUpCommand | ZeroDownCommand | SuppressorCommand | LoadCommand | ShotDropCommand | ClimbCommand | UseCommand;
export type CommandKind = Command['kind'];

/** How a command field is stored and quantized. */
export type CommandField = 'lag' | 'yaw' | 'pitch' | 'number';

export interface CommandSpec<C> {
  /** Identifies the kind in recordings. Never reuse a retired code. */
  code: number;
  /** The range the code was taken from (codes.ts). */
  range: CodeRange;
  fields: { readonly [F in Exclude<keyof C, 'kind'>]-?: CommandField };
}

export const COMMANDS: { readonly [K in CommandKind]: CommandSpec<Extract<Command, { kind: K }>> } = {
  fire: { code: 1, range: 'foundation', fields: { lag: 'lag', yaw: 'yaw', pitch: 'pitch' } },
  noise: { code: 10, range: 'perception', fields: { lag: 'lag', yaw: 'yaw', pitch: 'pitch' } },
  bodyDrop: { code: 11, range: 'perception', fields: { lag: 'lag', yaw: 'yaw', pitch: 'pitch' } },
  range: { code: 30, range: 'ballistics', fields: { lag: 'lag', yaw: 'yaw', pitch: 'pitch' } },
  throw: { code: 31, range: 'ballistics', fields: { lag: 'lag', yaw: 'yaw', pitch: 'pitch' } },
  zeroUp: { code: 32, range: 'ballistics', fields: {} },
  zeroDown: { code: 33, range: 'ballistics', fields: {} },
  suppressor: { code: 34, range: 'ballistics', fields: {} },
  shotDrop: { code: 35, range: 'ballistics', fields: { lag: 'lag', yaw: 'yaw', pitch: 'pitch' } },
  load: { code: 36, range: 'ballistics', fields: {} },
  stimulus: { code: 90, range: 'brain', fields: { what: 'number', x: 'number', y: 'number', z: 'number', fromX: 'number', fromY: 'number', fromZ: 'number' } },
  climb: { code: 50, range: 'body', fields: {} },
  use: { code: 51, range: 'body', fields: {} },
};

/** The most commands one tick carries; more are dropped, oldest kept. */
export const MAX_COMMANDS = 8;

/** Lag is stored in 1/120ths of a tick, up to 2 ticks. */
export const LAG_STEPS = 120;
export const MAX_LAG = 2;

/** A field's value as recorded. Idempotent: quantizing a quantized value changes nothing. */
export function quantField(codec: CommandField, v: number): number {
  const finite = Number.isFinite(v) ? v : 0;
  switch (codec) {
    case 'lag':
      return Math.round(clamp(finite, 0, MAX_LAG) * LAG_STEPS) / LAG_STEPS + 0;
    case 'yaw':
      return quantYaw(finite);
    case 'pitch':
      return quantPitch(finite);
    case 'number':
      return Math.fround(finite);
  }
}

/** A command as recorded: a new object with every field quantized. */
export function quantizeCommand(c: Command): Command {
  const spec = COMMANDS[c.kind] as CommandSpec<Command>;
  const out: Record<string, unknown> = { kind: c.kind };
  const fields = spec.fields as Readonly<Record<string, CommandField>>;
  const values = c as unknown as Readonly<Record<string, number>>;
  for (const name in fields) out[name] = quantField(fields[name]!, values[name]!);
  return out as unknown as Command;
}
