/**
 * Little-endian binary writing and reading for recordings. Reading is bounds-checked:
 * a recording is often a file from elsewhere, so running off the end is a format error
 * with a clear message, never a RangeError from deep inside a DataView.
 */

/** A recording that can't be read: truncated, corrupt or from an unknown format. */
export class RecordingFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecordingFormatError';
  }
}

/**
 * Writes into a list of fixed-size chunks rather than one growing buffer, so a long
 * recording never needs a copy of itself to grow, and saving hands the chunks to a Blob
 * as they are (`parts()`). A value never straddles two chunks.
 */
export class ByteWriter {
  private readonly chunks: Uint8Array[] = [];
  private chunk: Uint8Array;
  private view: DataView;
  private at = 0;
  private done = 0;

  private readonly chunkSize: number;

  constructor(chunkSize = 64 * 1024) {
    this.chunkSize = Math.max(16, Math.floor(chunkSize) || 16);
    this.chunk = new Uint8Array(this.chunkSize);
    this.view = new DataView(this.chunk.buffer);
  }

  /** Bytes written so far. */
  get length(): number {
    return this.done + this.at;
  }

  /** Closes the current chunk and starts one with room for at least `min` bytes. */
  private next(min: number): void {
    this.chunks.push(this.chunk.subarray(0, this.at));
    this.done += this.at;
    this.chunk = new Uint8Array(Math.max(this.chunkSize, min));
    this.view = new DataView(this.chunk.buffer);
    this.at = 0;
  }

  private room(n: number): number {
    if (this.at + n > this.chunk.length) this.next(n);
    const at = this.at;
    this.at += n;
    return at;
  }

  u8(v: number): void {
    // Room first: it may start a new chunk, and with it a new view.
    const at = this.room(1);
    this.view.setUint8(at, v);
  }

  i8(v: number): void {
    // Room first: it may start a new chunk, and with it a new view.
    const at = this.room(1);
    this.view.setInt8(at, v);
  }

  i16(v: number): void {
    // Room first: it may start a new chunk, and with it a new view.
    const at = this.room(2);
    this.view.setInt16(at, v, true);
  }

  u16(v: number): void {
    // Room first: it may start a new chunk, and with it a new view.
    const at = this.room(2);
    this.view.setUint16(at, v, true);
  }

  u32(v: number): void {
    // Room first: it may start a new chunk, and with it a new view.
    const at = this.room(4);
    this.view.setUint32(at, v, true);
  }

  i32(v: number): void {
    // Room first: it may start a new chunk, and with it a new view.
    const at = this.room(4);
    this.view.setInt32(at, v, true);
  }

  f32(v: number): void {
    // Room first: it may start a new chunk, and with it a new view.
    const at = this.room(4);
    this.view.setFloat32(at, v, true);
  }

  f64(v: number): void {
    // Room first: it may start a new chunk, and with it a new view.
    const at = this.room(8);
    this.view.setFloat64(at, v, true);
  }

  bytes(b: Uint8Array): void {
    let from = 0;
    while (from < b.length) {
      if (this.at === this.chunk.length) this.next(0);
      const n = Math.min(b.length - from, this.chunk.length - this.at);
      this.chunk.set(b.subarray(from, from + n), this.at);
      this.at += n;
      from += n;
    }
  }

  /** The bytes written so far, as chunks (views, not copies: don't write after taking them). */
  parts(): Uint8Array[] {
    return this.at > 0 ? [...this.chunks, this.chunk.subarray(0, this.at)] : [...this.chunks];
  }

  /** A copy of the bytes written so far, in one array. */
  toBytes(): Uint8Array {
    return concat(this.parts());
  }
}

export function concat(parts: readonly Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export class ByteReader {
  private readonly view: DataView;
  offset = 0;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get remaining(): number {
    return this.bytes.length - this.offset;
  }

  private need(n: number): number {
    if (this.offset + n > this.bytes.length) throw new RecordingFormatError('Recording is truncated');
    const at = this.offset;
    this.offset += n;
    return at;
  }

  u8(): number {
    return this.view.getUint8(this.need(1));
  }

  i8(): number {
    return this.view.getInt8(this.need(1));
  }

  u16(): number {
    return this.view.getUint16(this.need(2), true);
  }

  i16(): number {
    return this.view.getInt16(this.need(2), true);
  }

  u32(): number {
    return this.view.getUint32(this.need(4), true);
  }

  i32(): number {
    return this.view.getInt32(this.need(4), true);
  }

  f32(): number {
    return this.view.getFloat32(this.need(4), true);
  }

  f64(): number {
    return this.view.getFloat64(this.need(8), true);
  }

  /** The next `n` bytes, copied. */
  take(n: number): Uint8Array {
    const at = this.need(n);
    return this.bytes.slice(at, at + n);
  }

  /** The next `n` bytes, as a view into the same buffer (no copy). */
  sub(n: number): Uint8Array {
    const at = this.need(n);
    return this.bytes.subarray(at, at + n);
  }
}
