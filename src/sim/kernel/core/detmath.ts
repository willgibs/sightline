/**
 * Deterministic math for the simulation.
 *
 * Math.sin, cos, tan, atan2, pow, exp and log are implementation-defined in JavaScript,
 * and engines really do disagree in the last bit: Chrome and Node (both V8) were caught
 * returning different Math.atan2 results, which made a browser recording fail to
 * re-simulate in Node. A seed must build the same valley everywhere, and a recording
 * must replay anywhere, so everything under src/sim uses only + - * /, Math.floor,
 * Math.round, Math.abs, Math.sign, Math.min/max, Math.sqrt and Math.fround (all exactly
 * specified by IEEE 754 and ECMAScript) plus the functions below, which are built from
 * those alone. tests/architecture.test.ts enforces this.
 */

export const PI = 3.141592653589793;
export const HALF_PI = 1.5707963267948966;
export const TWO_PI = 6.283185307179586;
export const DEG = PI / 180;

/** sin on [-π/4, π/4]: Taylor series to x^15, error well under 1e-15 on that range. */
function sinKernel(x: number): number {
  const x2 = x * x;
  return (
    x *
    (1 +
      x2 *
        (-1 / 6 +
          x2 *
            (1 / 120 +
              x2 *
                (-1 / 5040 +
                  x2 * (1 / 362880 + x2 * (-1 / 39916800 + x2 * (1 / 6227020800 + x2 * (-1 / 1307674368000))))))))
  );
}

/** cos on [-π/4, π/4]: Taylor series to x^14. */
function cosKernel(x: number): number {
  const x2 = x * x;
  return (
    1 +
    x2 *
      (-1 / 2 +
        x2 *
          (1 / 24 +
            x2 *
              (-1 / 720 +
                x2 * (1 / 40320 + x2 * (-1 / 3628800 + x2 * (1 / 479001600 + x2 * (-1 / 87178291200)))))))
  );
}

/**
 * Reduce x to r in [-π/4, π/4] and a quadrant q in 0..3 with x = q·π/2 + r.
 *
 * Below 10⁶ this is the plain reduction every recording and valley so far was made with,
 * kept bit for bit: it loses about |x|·1e-16 to HALF_PI's rounding, which is nothing at
 * the angles the simulation uses. From 10⁶ up it is exact (Payne–Hanek, below), so a huge
 * argument gives the right answer instead of noise. No simulation input reaches 10⁶
 * (tests/detmath.test.ts), so the switch moved no golden.
 */
function reduce(x: number): { r: number; q: number } {
  if (!(Math.abs(x) < LARGE)) return reduceLarge(x);
  const k = Math.floor(x / HALF_PI + 0.5);
  const q = ((k % 4) + 4) % 4;
  return { r: x - k * HALF_PI, q };
}

/** Where the exact reduction takes over. */
const LARGE = 1e6;

/**
 * 2/π in 24-bit limbs: 2/π = Σ TWO_OVER_PI[k]·2^(−24(k + 1)). Enough for every finite
 * double; tests/detmath.test.ts recomputes them exactly from Machin's formula.
 */
export const TWO_OVER_PI: readonly number[] = [
  0xa2f983, 0x6e4e44, 0x1529fc, 0x2757d1, 0xf534dd, 0xc0db62, 0x95993c, 0x439041, 0xfe5163, 0xabdebb, 0xc561b7, 0x246e3a, 0x424dd2, 0xe00649, 0x2eea09,
  0xd1921c, 0xfe1deb, 0x1cb129, 0xa73ee8, 0x8235f5, 0x2ebb44, 0x84e99c, 0x7026b4, 0x5f7e41, 0x3991d6, 0x398353, 0x39f49c, 0x845f8b, 0xbdf928, 0x3b1ff8,
  0x97ffde, 0x05980f, 0xef2f11, 0x8b5a0a, 0x6d1f6d, 0x367ecf, 0x27cb09, 0xb74f46, 0x3f669e, 0x5fea2d, 0x7527ba, 0xc7ebe5, 0xf17b3d, 0x0739f7, 0x8a5292,
  0xea6bfb, 0x5fb11f, 0x8d5d08, 0x560330, 0x46fc7b, 0x6babf0, 0xcfbc20, 0x9af436, 0x1da9e3, 0x91615e, 0xe61b08, 0x659985, 0x5f14a0, 0x68408d, 0xffd880,
  0x4d7327, 0x310606, 0x1556ca, 0x73a8c9, 0x60e27b, 0xc08c6b,
];
const TWO24 = 16777216;
/** Fraction limbs kept: enough for the worst cancellation a double can show (about 62 bits) and 53 more. */
const FRACTION_LIMBS = 8;
const PIO2_HI = 1.5707963267948966;
const PIO2_LO = 6.123233995736766e-17;

/**
 * Payne–Hanek: x·2/π computed exactly in 24-bit limbs, every product of two limbs exact
 * in a double, so only the bits of 2/π that reach the quadrant and the fraction are used.
 * Built from + − * and floor alone, like the rest of this file.
 */
function reduceLarge(x: number): { r: number; q: number } {
  if (x !== x || x === Infinity || x === -Infinity) return { r: NaN, q: 0 };
  const neg = x < 0;
  const ax = neg ? -x : x;
  bits.setFloat64(0, ax, false);
  const e = ((bits.getUint32(0, false) >>> 20) & 0x7ff) - 1023; // ax in [2^e, 2^(e+1)), e ≥ 19
  // ax = Σ xs[i]·2^(24(top − i)): four limbs hold its 53 bits wherever they fall.
  const top = Math.floor(e / 24);
  const xs = [0, 0, 0, 0];
  let y = ax * pow2i(-24 * top);
  for (let i = 0; i < 4; i++) {
    const d = Math.floor(y);
    xs[i] = d;
    y = (y - d) * TWO24;
  }
  // Column n of the product weighs 2^(24(top − n)); columns above n = top are multiples of
  // 2^24, so they can't change the quadrant. Column top is the integer part's last limb.
  const q = new Array<number>(FRACTION_LIMBS + 1).fill(0);
  for (let m = 0; m <= FRACTION_LIMBS; m++) {
    const n = top + m;
    let sum = 0;
    for (let i = 0; i < 4; i++) {
      const k = n - i; // limb k of 2/π weighs 2^(−24k), from k = 1
      if (k >= 1 && k <= TWO_OVER_PI.length) sum += xs[i]! * TWO_OVER_PI[k - 1]!;
    }
    q[m] = sum;
  }
  for (let m = FRACTION_LIMBS; m >= 1; m--) {
    const carry = Math.floor(q[m]! / TWO24);
    q[m] = q[m]! - carry * TWO24;
    q[m - 1] = q[m - 1]! + carry;
  }
  const whole = q[0]! - 4 * Math.floor(q[0]! / 4);
  // The fraction f, limb by limb. Past one half, take f − 1 instead, as its distance below 1.
  const upper = q[1]! >= TWO24 / 2;
  const g = q.slice(1);
  if (upper) {
    for (let m = 0; m < FRACTION_LIMBS; m++) g[m] = TWO24 - 1 - g[m]!;
    for (let m = FRACTION_LIMBS - 1; m >= 0; m--) {
      g[m] = g[m]! + 1;
      if (g[m]! < TWO24) break;
      g[m] = 0;
    }
  }
  // Leading zero limbs cancel exactly; the next two give 48 exact bits, the rest a correction.
  let m0 = 0;
  while (m0 < FRACTION_LIMBS && g[m0] === 0) m0++;
  let r = 0;
  if (m0 < FRACTION_LIMBS) {
    const w = pow2i(-24 * (m0 + 1));
    const hi = g[m0]! * w + (m0 + 1 < FRACTION_LIMBS ? g[m0 + 1]! * w * pow2i(-24) : 0);
    let lo = 0;
    for (let m = FRACTION_LIMBS - 1; m >= m0 + 2; m--) lo += g[m]! * pow2i(-24 * (m + 1));
    r = hi * PIO2_HI + (lo * PIO2_HI + hi * PIO2_LO);
  }
  if (upper) r = -r;
  let quadrant = (whole + (upper ? 1 : 0)) % 4;
  if (neg) {
    quadrant = (4 - quadrant) % 4;
    r = -r;
  }
  return { r, q: quadrant };
}

export function dsin(x: number): number {
  const { r, q } = reduce(x);
  switch (q) {
    case 0:
      return sinKernel(r);
    case 1:
      return cosKernel(r);
    case 2:
      return -sinKernel(r);
    default:
      return -cosKernel(r);
  }
}

export function dcos(x: number): number {
  const { r, q } = reduce(x);
  switch (q) {
    case 0:
      return cosKernel(r);
    case 1:
      return -sinKernel(r);
    case 2:
      return -cosKernel(r);
    default:
      return sinKernel(r);
  }
}

/** tan of an angle in degrees, for slope limits. Straight up (±90°) is infinitely steep. */
export function dtanDeg(deg: number): number {
  const c = dcos(deg * DEG);
  const s = dsin(deg * DEG);
  // dcos(π/2) is exactly −0 here, which would make tan(90°) −Infinity.
  if (c === 0) return s > 0 ? Infinity : -Infinity;
  return s / c;
}

export function dcosDeg(deg: number): number {
  return dcos(deg * DEG);
}

/** atan for |x| <= tan(π/16), by Taylor series to x^23 (error below 1e-17). */
function atanKernel(x: number): number {
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let k = 3; k <= 23; k += 2) {
    term *= -x2;
    sum += term / k;
  }
  return sum;
}

/** atan of x, deterministic. */
export function datan(x: number): number {
  if (x !== x) return x; // NaN
  const neg = x < 0;
  let a = neg ? -x : x;
  let offset = 0;
  if (a > 1) {
    // atan(a) = π/2 - atan(1/a)
    a = 1 / a;
    offset = HALF_PI;
  }
  // Two half-angle reductions: atan(a) = 2·atan(a / (1 + sqrt(1 + a²))).
  a = a / (1 + Math.sqrt(1 + a * a));
  a = a / (1 + Math.sqrt(1 + a * a));
  let r = 4 * atanKernel(a);
  if (offset) r = offset - r;
  return neg ? -r : r;
}

/**
 * atan2(y, x), deterministic, matching Math.atan2's quadrants, NaN and infinities. One
 * difference, kept on purpose because changing it would move existing angles: +0 and −0
 * are treated alike, so datan2(±0, x < 0) is +π and the sign of a zero result is +.
 */
export function datan2(y: number, x: number): number {
  if (x !== x || y !== y) return NaN;
  if (y === Infinity || y === -Infinity) {
    const q = x === Infinity ? PI / 4 : x === -Infinity ? (3 * PI) / 4 : HALF_PI;
    return y > 0 ? q : -q;
  }
  if (x > 0) return datan(y / x);
  if (x < 0) return y >= 0 ? datan(y / x) + PI : datan(y / x) - PI;
  if (y > 0) return HALF_PI;
  if (y < 0) return -HALF_PI;
  return 0;
}

/**
 * Unit vectors at even angles around the circle, starting at +x and turning toward +z,
 * built by repeated rotation so every engine produces the same bits.
 */
export function circleDirections(count: number): Array<{ x: number; z: number }> {
  const step = TWO_PI / count;
  const c = dcos(step);
  const s = dsin(step);
  const out: Array<{ x: number; z: number }> = [];
  let x = 1;
  let z = 0;
  for (let i = 0; i < count; i++) {
    out.push({ x, z });
    const nx = x * c - z * s;
    const nz = x * s + z * c;
    // Renormalise so accumulated rounding never drifts the length.
    const len = Math.sqrt(nx * nx + nz * nz);
    x = nx / len;
    z = nz / len;
  }
  return out;
}

// ── Exponentials and logarithms ──────────────────────────────────────────────────────────
// Built the same way: exact range reduction (the exponent field read and written through a
// DataView, which is exactly specified), then a short series on a small interval.

const LN2_HI = 6.93147180369123816490e-1; // ln 2 split so k·LN2_HI is exact for |k| < 2^20
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.44269504088896338700;
const SQRT1_2 = 0.7071067811865476;
const bits = new DataView(new ArrayBuffer(8));

/** 2^k for an integer k, exactly, including subnormal results. */
function pow2i(k: number): number {
  if (k > 1023) return Infinity;
  if (k < -1074) return 0;
  if (k < -1022) return pow2i(k + 1022) * pow2i(-1022);
  bits.setUint32(0, (k + 1023) << 20, false);
  bits.setUint32(4, 0, false);
  return bits.getFloat64(0, false);
}

/** e^x, deterministic. Relative error under 1e-15 across the double range. */
export function dexp(x: number): number {
  if (x !== x) return x;
  if (x > 709.782712893384) return Infinity;
  if (x < -745.1332191019412) return 0;
  const k = Math.round(x * INV_LN2);
  const r = x - k * LN2_HI - k * LN2_LO; // |r| ≤ ln2/2
  // Taylor series for e^r to r^14 in Horner form: the last term is under 1e-17 here.
  let sum = 1;
  for (let i = 14; i >= 1; i--) sum = 1 + (r / i) * sum;
  // Split the scale at either end of the range, where 2^k alone would overflow or
  // lose bits to the subnormal range.
  if (k > 1000) return sum * pow2i(k - 60) * pow2i(60);
  if (k < -1000) return sum * pow2i(k + 60) * pow2i(-60);
  return sum * pow2i(k);
}

/** Natural logarithm, deterministic. Relative error under 1e-15 for positive inputs. */
export function dlog(x: number): number {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  let scale = 0;
  if (x < 2.2250738585072014e-308) {
    // Subnormal: lift it into the normal range first.
    x *= 18014398509481984; // 2^54
    scale = -54;
  }
  bits.setFloat64(0, x, false);
  const hi = bits.getUint32(0, false);
  let e = ((hi >>> 20) & 0x7ff) - 1023 + scale;
  // Mantissa as a number in [1, 2).
  bits.setUint32(0, (hi & 0x000fffff) | 0x3ff00000, false);
  let m = bits.getFloat64(0, false);
  if (m > 2 * SQRT1_2) {
    m /= 2;
    e += 1;
  }
  // log(m) = 2·atanh(s) with s = (m − 1) / (m + 1), |s| ≤ 0.1716.
  const s = (m - 1) / (m + 1);
  const s2 = s * s;
  let term = s;
  let sum = s;
  for (let i = 3; i <= 27; i += 2) {
    term *= s2;
    sum += term / i;
  }
  return e * LN2_HI + (2 * sum + e * LN2_LO);
}

/**
 * x^y, deterministic. Exact for integer exponents up to 2^31 by repeated squaring;
 * otherwise e^(y·log x), with relative error growing with |y·log x| (about 1e-14 at 30).
 * Follows Math.pow's special cases for zeros, infinities and negative bases.
 */
export function dpow(x: number, y: number): number {
  if (y === 0) return 1;
  if (x !== x || y !== y) return NaN;
  const yInt = Math.floor(y) === y;
  if (yInt && Math.abs(y) <= 2147483648) {
    let base = y < 0 ? 1 / x : x;
    let n = Math.abs(y);
    let result = 1;
    while (n > 0) {
      if (n % 2 === 1) result *= base;
      base *= base;
      n = Math.floor(n / 2);
    }
    return result;
  }
  if (x < 0) return NaN; // a negative base needs an integer exponent
  if (x === 0) return y > 0 ? 0 : Infinity;
  if (x === Infinity) return y > 0 ? Infinity : 0;
  return dexp(y * dlog(x));
}
