import { STATE_SCHEMA, assertPlain, type SimState } from '../state';
import { ByteReader, ByteWriter, RecordingFormatError } from './bytes';

/**
 * Save-states on disk: the state tree (state.ts) as bytes, exactly. Every number keeps
 * its 64 bits, −0 and NaN included; every object keeps its keys in their order; nothing
 * else is stored, because nothing else is state. Restoring a decoded state continues the
 * run bit for bit, which the fuzz run's synctest mode checks over hours of play
 * (kernel/synctest.ts, `npm run fuzz -- --synctest`).
 *
 * File: "SLST", u32 codec version, u32 STATE_SCHEMA, then the tree: each value a tag byte
 * (null, false, true, number, string, array, object) and its contents.
 */

const MAGIC = [0x53, 0x4c, 0x53, 0x54]; // SLST
export const STATE_CODEC_VERSION = 1;
const Tag = { Null: 0, False: 1, True: 2, Number: 3, String: 4, Array: 5, Object: 6 } as const;
/** Deeper than any state tree: a file that nests further is damaged. */
const MAX_DEPTH = 64;

const text = new TextEncoder();
const untext = new TextDecoder('utf-8', { fatal: true });

export function encodeState(s: SimState): Uint8Array {
  assertPlain(s);
  const w = new ByteWriter();
  for (const b of MAGIC) w.u8(b);
  w.u32(STATE_CODEC_VERSION);
  w.u32(s.schema);
  put(w, s);
  return w.toBytes();
}

/** Decodes a save-state, checking everything before trusting it; throws RecordingFormatError if it can't. */
export function decodeState(bytes: Uint8Array): SimState {
  const r = new ByteReader(bytes);
  for (const b of MAGIC) if (r.remaining === 0 || r.u8() !== b) throw new RecordingFormatError('Not a Sightline save-state');
  const version = r.u32();
  if (version !== STATE_CODEC_VERSION) throw new RecordingFormatError(`Save-state codec ${version} is not ${STATE_CODEC_VERSION}`);
  const schema = r.u32();
  if (schema !== STATE_SCHEMA) throw new RecordingFormatError(`Save-state schema ${schema} is not ${STATE_SCHEMA}`);
  const s = take(r, 0);
  if (r.remaining !== 0) throw new RecordingFormatError('Corrupt save-state: bytes after the tree');
  if (!s || typeof s !== 'object' || Array.isArray(s) || (s as SimState).schema !== schema) throw new RecordingFormatError('Corrupt save-state: not a state tree');
  return s as SimState;
}

function put(w: ByteWriter, v: unknown): void {
  if (v === null) return w.u8(Tag.Null);
  switch (typeof v) {
    case 'boolean':
      return w.u8(v ? Tag.True : Tag.False);
    case 'number':
      w.u8(Tag.Number);
      return w.f64(v);
    case 'string': {
      const b = text.encode(v);
      w.u8(Tag.String);
      w.u32(b.length);
      return w.bytes(b);
    }
    default:
      if (Array.isArray(v)) {
        w.u8(Tag.Array);
        w.u32(v.length);
        for (const x of v) put(w, x);
        return;
      }
      {
        const keys = Object.keys(v as object);
        w.u8(Tag.Object);
        w.u32(keys.length);
        for (const k of keys) {
          put(w, k);
          put(w, (v as Record<string, unknown>)[k]);
        }
      }
  }
}

function take(r: ByteReader, depth: number): unknown {
  if (depth > MAX_DEPTH) throw new RecordingFormatError('Corrupt save-state: nested too deep');
  const tag = r.u8();
  switch (tag) {
    case Tag.Null:
      return null;
    case Tag.False:
      return false;
    case Tag.True:
      return true;
    case Tag.Number:
      return r.f64();
    case Tag.String: {
      const n = r.u32();
      try {
        return untext.decode(r.take(n));
      } catch (e) {
        if (e instanceof RecordingFormatError) throw e;
        throw new RecordingFormatError('Corrupt save-state: a string is not text');
      }
    }
    case Tag.Array: {
      const n = r.u32();
      if (n > r.remaining) throw new RecordingFormatError('Corrupt save-state: an array is longer than the file');
      const out: unknown[] = [];
      for (let i = 0; i < n; i++) out.push(take(r, depth + 1));
      return out;
    }
    case Tag.Object: {
      const n = r.u32();
      if (n > r.remaining) throw new RecordingFormatError('Corrupt save-state: an object is longer than the file');
      const out: Record<string, unknown> = {};
      for (let i = 0; i < n; i++) {
        const k = take(r, depth + 1);
        if (typeof k !== 'string') throw new RecordingFormatError('Corrupt save-state: a key is not a string');
        if (k === '__proto__' || Object.hasOwn(out, k)) throw new RecordingFormatError(`Corrupt save-state: key '${k}'`);
        out[k] = take(r, depth + 1);
      }
      return out;
    }
    default:
      throw new RecordingFormatError(`Corrupt save-state: unknown tag ${tag}`);
  }
}
