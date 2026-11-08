import { EVENTS, type EventType, type FieldCodec, type SimEvent } from '../events';
import { RecordingFormatError, type ByteReader, type ByteWriter } from './bytes';

/**
 * Events in recordings, encoded from the registry in events.ts: a type code, the base
 * fields (id, tick, time, source, cause), then the type's own fields in registry order.
 * A new event type needs no code here.
 */

const TYPE_BY_CODE = new Map<number, EventType>((Object.keys(EVENTS) as EventType[]).map((type) => [EVENTS[type].code, type]));

export function writeEvent(w: ByteWriter, e: SimEvent): void {
  const spec = EVENTS[e.type];
  w.u8(spec.code);
  w.u32(e.id);
  w.u32(e.tick);
  w.f64(e.t);
  w.i32(e.source);
  w.u32(e.cause);
  const fields = spec.fields as Readonly<Record<string, FieldCodec>>;
  const values = e as unknown as Readonly<Record<string, unknown>>;
  for (const name in fields) writeField(w, fields[name]!, values[name], e.type, name);
}

export function readEvent(r: ByteReader): SimEvent {
  const code = r.u8();
  const type = TYPE_BY_CODE.get(code);
  if (!type) throw new RecordingFormatError(`Unknown event type ${code}`);
  const e: Record<string, unknown> = { type, id: r.u32(), tick: r.u32(), t: r.f64(), source: r.i32(), cause: r.u32() };
  const fields = EVENTS[type].fields as Readonly<Record<string, FieldCodec>>;
  for (const name in fields) e[name] = readField(r, fields[name]!, type, name);
  return e as unknown as SimEvent;
}

function writeField(w: ByteWriter, codec: FieldCodec, v: unknown, type: string, name: string): void {
  if (typeof codec === 'object') {
    const k = codec.enum.indexOf(v as string);
    if (k < 0) throw new Error(`Event ${type}.${name} is '${String(v)}', not one of ${codec.enum.join(', ')}`);
    w.u8(k);
    return;
  }
  const n = v as number;
  switch (codec) {
    case 'u8':
      w.u8(n);
      return;
    case 'i32':
      w.i32(n);
      return;
    case 'u32':
      w.u32(n);
      return;
    case 'f32':
      w.f32(n);
      return;
    case 'f64':
      w.f64(n);
      return;
  }
}

function readField(r: ByteReader, codec: FieldCodec, type: string, name: string): unknown {
  if (typeof codec === 'object') {
    const v = codec.enum[r.u8()];
    if (v === undefined) throw new RecordingFormatError(`Event ${type}.${name} has an unknown value`);
    return v;
  }
  switch (codec) {
    case 'u8':
      return r.u8();
    case 'i32':
      return r.i32();
    case 'u32':
      return r.u32();
    case 'f32':
      return r.f32();
    case 'f64':
      return r.f64();
  }
}
