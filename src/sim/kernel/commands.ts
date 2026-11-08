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

export type Command = FireCommand | RangeCommand | ThrowCommand | ZeroUpCommand | ZeroDownCommand | SuppressorCommand;
export type CommandKind = Command['kind'];

/** How a command field is stored and quantized. */
export type CommandField = 'lag' | 'yaw' | 'pitch';

export interface CommandSpec<C> {
  /** Identifies the kind in recordings. Never reuse a retired code. */
  code: number;
  /** The range the code was taken from (codes.ts). */
  range: CodeRange;
  fields: { readonly [F in Exclude<keyof C, 'kind'>]-?: CommandField };
}

export const COMMANDS: { readonly [K in CommandKind]: CommandSpec<Extract<Command, { kind: K }>> } = {
  fire: { code: 1, range: 'foundation', fields: { lag: 'lag', yaw: 'yaw', pitch: 'pitch' } },
  range: { code: 30, range: 'ballistics', fields: { lag: 'lag', yaw: 'yaw', pitch: 'pitch' } },
  throw: { code: 31, range: 'ballistics', fields: { lag: 'lag', yaw: 'yaw', pitch: 'pitch' } },
  zeroUp: { code: 32, range: 'ballistics', fields: {} },
  zeroDown: { code: 33, range: 'ballistics', fields: {} },
  suppressor: { code: 34, range: 'ballistics', fields: {} },
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
