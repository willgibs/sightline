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
 * The simulation resolves a precise command against its pose history (motor/body.ts),
 * so what it computes matches what was on screen, at any frame rate.
 *
 * Adding a command: add it to Command and to COMMANDS with a new code. Its fields are
 * quantized by their codec, so live play and re-simulation see the same numbers.
 */

export interface FireCommand {
  kind: 'fire';
  lag: number;
  yaw: number;
  pitch: number;
}

export type Command = FireCommand;
export type CommandKind = Command['kind'];

/** How a command field is stored and quantized. */
export type CommandField = 'lag' | 'yaw' | 'pitch';

export interface CommandSpec<C> {
  /** Identifies the kind in recordings. Never reuse a retired code. */
  code: number;
  fields: { readonly [F in Exclude<keyof C, 'kind'>]-?: CommandField };
}

export const COMMANDS: { readonly [K in CommandKind]: CommandSpec<Extract<Command, { kind: K }>> } = {
  fire: { code: 1, fields: { lag: 'lag', yaw: 'yaw', pitch: 'pitch' } },
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
