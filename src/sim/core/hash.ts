/**
 * Hashing for determinism checks: two runs with the same seed and inputs must produce
 * the same state hash, tick for tick.
 */

const scratch = new DataView(new ArrayBuffer(8));

function hex8(v: number): string {
  return (v >>> 0).toString(16).padStart(8, '0');
}

/** A 64-bit (two-lane) streaming hash over numbers and strings. */
export class Hasher {
  private h1 = 0x811c9dc5;
  private h2 = 0x9e3779b9;

  private byte(b: number): void {
    this.h1 = Math.imul(this.h1 ^ b, 16777619);
    this.h2 = Math.imul(this.h2 ^ b, 0x5bd1e995);
    this.h2 ^= this.h2 >>> 15;
  }

  u32(v: number): this {
    this.byte(v & 0xff);
    this.byte((v >>> 8) & 0xff);
    this.byte((v >>> 16) & 0xff);
    this.byte((v >>> 24) & 0xff);
    return this;
  }

  /** Hashes the exact bits of a double. */
  f64(v: number): this {
    scratch.setFloat64(0, v, true);
    for (let i = 0; i < 8; i++) this.byte(scratch.getUint8(i));
    return this;
  }

  str(s: string): this {
    this.u32(s.length);
    for (let i = 0; i < s.length; i++) this.u32(s.charCodeAt(i));
    return this;
  }

  bytes(b: ArrayLike<number>): this {
    for (let i = 0; i < b.length; i++) this.byte(b[i]!);
    return this;
  }

  digest(): string {
    let a = this.h1 ^ (this.h2 >>> 7);
    let b = this.h2 ^ (this.h1 << 5);
    a = Math.imul(a ^ (a >>> 16), 0x85ebca6b);
    a = Math.imul(a ^ (a >>> 13), 0xc2b2ae35);
    b = Math.imul(b ^ (b >>> 16), 0x85ebca6b);
    b = Math.imul(b ^ (b >>> 13), 0xc2b2ae35);
    return hex8(a ^ (a >>> 16)) + hex8(b ^ (b >>> 16));
  }
}

/** JSON with object keys sorted, so equal values always stringify identically. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function hashString(s: string): string {
  return new Hasher().str(s).digest();
}

export function hashValue(value: unknown): string {
  return hashString(stableStringify(value));
}
