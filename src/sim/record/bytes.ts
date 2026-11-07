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

export class ByteWriter {
  private buf: Uint8Array;
  private view: DataView;
  length = 0;

  constructor(initial = 4096) {
    this.buf = new Uint8Array(initial);
    this.view = new DataView(this.buf.buffer);
  }

  private ensure(extra: number): void {
    if (this.length + extra <= this.buf.length) return;
    let size = Math.max(1, this.buf.length) * 2;
    while (size < this.length + extra) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }

  u8(v: number): void {
    this.ensure(1);
    this.view.setUint8(this.length, v);
    this.length += 1;
  }

  i8(v: number): void {
    this.ensure(1);
    this.view.setInt8(this.length, v);
    this.length += 1;
  }

  i16(v: number): void {
    this.ensure(2);
    this.view.setInt16(this.length, v, true);
    this.length += 2;
  }

  u16(v: number): void {
    this.ensure(2);
    this.view.setUint16(this.length, v, true);
    this.length += 2;
  }

  u32(v: number): void {
    this.ensure(4);
    this.view.setUint32(this.length, v, true);
    this.length += 4;
  }

  i32(v: number): void {
    this.ensure(4);
    this.view.setInt32(this.length, v, true);
    this.length += 4;
  }

  f32(v: number): void {
    this.ensure(4);
    this.view.setFloat32(this.length, v, true);
    this.length += 4;
  }

  f64(v: number): void {
    this.ensure(8);
    this.view.setFloat64(this.length, v, true);
    this.length += 8;
  }

  bytes(b: Uint8Array): void {
    this.ensure(b.length);
    this.buf.set(b, this.length);
    this.length += b.length;
  }

  /** A copy of the bytes written so far. */
  toBytes(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
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

  take(n: number): Uint8Array {
    const at = this.need(n);
    return this.bytes.slice(at, at + n);
  }
}
