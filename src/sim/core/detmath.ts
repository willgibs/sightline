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

/** Reduce x to r in [-π/4, π/4] and a quadrant q in 0..3 with x = q·π/2 + r. */
function reduce(x: number): { r: number; q: number } {
  const k = Math.floor(x / HALF_PI + 0.5);
  const q = ((k % 4) + 4) % 4;
  return { r: x - k * HALF_PI, q };
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

/** tan of an angle in degrees, for slope limits. */
export function dtanDeg(deg: number): number {
  return dsin(deg * DEG) / dcos(deg * DEG);
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

/** atan2(y, x), deterministic, matching Math.atan2's quadrant conventions. */
export function datan2(y: number, x: number): number {
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
