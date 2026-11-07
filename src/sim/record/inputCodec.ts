import { COMMANDS, LAG_STEPS, type Command, type CommandField, type CommandKind, type CommandSpec } from '../commands';
import { InputFlag, fromHeldByte, heldByte, type TickInput } from '../input';
import { RecordingFormatError, type ByteReader, type ByteWriter } from './bytes';

/**
 * One tick of input in a recording: 12 bytes of controls (axes, flags, held states,
 * view angles), a command count, then each command: its code and its fields. The
 * values are already quantized (input.ts, commands.ts), so they store exactly.
 */

const KIND_BY_CODE = new Map<number, CommandKind>((Object.keys(COMMANDS) as CommandKind[]).map((k) => [COMMANDS[k].code, k]));

export function writeInput(w: ByteWriter, f: TickInput): void {
  w.i8(Math.round(f.moveX * 127));
  w.i8(Math.round(f.moveZ * 127));
  w.u8((f.sprint ? InputFlag.Sprint : 0) | (f.crouch ? InputFlag.Crouch : 0) | (f.prone ? InputFlag.Prone : 0));
  w.u8(heldByte(f));
  w.f32(f.yaw);
  w.f32(f.pitch);
  w.u8(f.commands.length);
  for (const c of f.commands) {
    const spec = COMMANDS[c.kind] as CommandSpec<Command>;
    w.u8(spec.code);
    const fields = spec.fields as Readonly<Record<string, CommandField>>;
    const values = c as unknown as Readonly<Record<string, number>>;
    for (const name in fields) {
      const v = values[name]!;
      if (fields[name] === 'lag') w.u8(Math.round(v * LAG_STEPS));
      else w.f32(v);
    }
  }
}

export function readInput(r: ByteReader, out: TickInput): TickInput {
  out.moveX = r.i8() / 127;
  out.moveZ = r.i8() / 127;
  const flags = r.u8();
  out.sprint = (flags & InputFlag.Sprint) !== 0;
  out.crouch = (flags & InputFlag.Crouch) !== 0;
  out.prone = (flags & InputFlag.Prone) !== 0;
  fromHeldByte(r.u8(), out);
  out.yaw = r.f32();
  out.pitch = r.f32();
  out.commands.length = 0;
  const n = r.u8();
  for (let k = 0; k < n; k++) {
    const code = r.u8();
    const kind = KIND_BY_CODE.get(code);
    if (!kind) throw new RecordingFormatError(`Unknown command ${code}`);
    const c: Record<string, unknown> = { kind };
    const fields = COMMANDS[kind].fields as Readonly<Record<string, CommandField>>;
    for (const name in fields) c[name] = fields[name] === 'lag' ? r.u8() / LAG_STEPS : r.f32();
    out.commands.push(c as unknown as Command);
  }
  return out;
}
