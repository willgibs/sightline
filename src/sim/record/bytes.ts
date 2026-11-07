/** Little-endian binary writing and reading for recordings. */

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
    let size = this.buf.length * 2;
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

  f32(v: number): void {
    this.ensure(4);
    this.view.setFloat32(this.length, v, true);
    this.length += 4;
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

  u8(): number {
    const v = this.view.getUint8(this.offset);
    this.offset += 1;
    return v;
  }

  u32(): number {
    const v = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }

  take(n: number): Uint8Array {
    if (this.offset + n > this.bytes.length) throw new Error('Recording is truncated');
    const out = this.bytes.slice(this.offset, this.offset + n);
    this.offset += n;
    return out;
  }
}
