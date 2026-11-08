import { datan, datan2, dcos, dexp, dlog, dpow, dsin, dtanDeg } from './detmath';

/**
 * Known answers, checked at startup: exact bits of `Math.sqrt` and of the deterministic
 * math (detmath.ts) for a few inputs. ECMAScript specifies `Math.sqrt` only as
 * implementation-approximated: every engine CI runs rounds it correctly, and
 * tests/known.test.ts proves the values below are the correctly rounded roots, but an
 * engine outside CI, or a new release of one, could differ, and engines do change their
 * math (V8 moved sin, cos and pow onto another library). detmath is built only from
 * operations IEEE 754 fixes exactly, so its answers pin the engine's arithmetic itself.
 * A run whose math disagrees can't replay anywhere else, so the game says so rather
 * than play on.
 *
 * Fast enough to run on every start: a few dozen operations.
 */

/** Inputs, and the exact result as the 16 hex digits of its 64 bits. */
const SQRT: ReadonlyArray<readonly [number, string]> = [
  [2, '3ff6a09e667f3bcd'],
  [3, '3ffbb67ae8584caa'],
  [0.5, '3fe6a09e667f3bcd'],
  [0.1, '3fd43d136248490f'],
  [10, '40094c583ada5b53'],
  [123456.789, '4075f5d3b16948f6'],
  [1e-300, '20ca2fe76a3f9475'],
  [5e-324, '1e60000000000000'],
  [1.7976931348623157e308, '5fefffffffffffff'],
  [4503599627370497, '4190000000000000'],
  [0.9999999999999999, '3fefffffffffffff'],
  [1.0000000000000002, '3ff0000000000000'],
];

const ONE: ReadonlyArray<readonly [name: string, f: (x: number) => number, x: number, bits: string]> = [
  ['dsin', dsin, 1, '3feaed548f090cee'],
  ['dsin', dsin, -2.5, 'bfe326af0dcfcaaf'],
  ['dsin', dsin, 100, 'bfe03425b78c4d99'],
  ['dcos', dcos, 1, '3fe14a280fb5068b'],
  ['dcos', dcos, 0.25, '3fef01549f7deea1'],
  ['dcos', dcos, -3, 'bfefae04be85e5d3'],
  ['datan', datan, 0.5, '3fddac670561bb4f'],
  ['datan', datan, -7, 'bff6dcc57bb565fc'],
  ['datan', datan, 1e-8, '3e45798ee2308c3a'],
  ['dexp', dexp, 1, '4005bf0a8b14576a'],
  ['dexp', dexp, -3.5, '3f9eec1018e4ff66'],
  ['dexp', dexp, 20, '41bceb088b68e804'],
  ['dlog', dlog, 10, '40026bb1bbb55516'],
  ['dlog', dlog, 0.001, 'c01ba18a998fffa0'],
  ['dlog', dlog, 123456, '40277280f4671181'],
  ['dtanDeg', dtanDeg, 30, '3fe279a74590331b'],
  ['dtanDeg', dtanDeg, -60, 'bffbb67ae8584caa'],
  ['dtanDeg', dtanDeg, 89, '404ca51d76749a66'],
];

const TWO: ReadonlyArray<readonly [name: string, f: (a: number, b: number) => number, a: number, b: number, bits: string]> = [
  ['datan2', datan2, 1, -2, '40056c6e7397f5ae'],
  ['datan2', datan2, -0.5, 3, 'bfc52397843c9add'],
  ['datan2', datan2, 7, 0.001, '3ff9216588582346'],
  ['dpow', dpow, 2, 0.5, '3ff6a09e667f3bcc'],
  ['dpow', dpow, 9.81, 1.7, '4048415dc79d5cd7'],
  ['dpow', dpow, 0.3, -2.2, '402c45be63c8d58c'],
];

const view = new DataView(new ArrayBuffer(8));

/** The 64 bits of a number, as 16 hex digits (big-endian, so the same on every machine). */
export function bitsOf(v: number): string {
  view.setFloat64(0, v, false);
  return view.getUint32(0, false).toString(16).padStart(8, '0') + view.getUint32(4, false).toString(16).padStart(8, '0');
}

/** Every known answer this engine gets wrong, in words; none means its math is the one recordings assume. */
export function knownAnswerProblems(): string[] {
  const out: string[] = [];
  const check = (what: string, got: number, want: string): void => {
    const bits = bitsOf(got);
    if (bits !== want) out.push(`${what} is ${bits}, not ${want}`);
  };
  for (const [x, want] of SQRT) check(`Math.sqrt(${x})`, Math.sqrt(x), want);
  for (const [name, f, x, want] of ONE) check(`${name}(${x})`, f(x), want);
  for (const [name, f, a, b, want] of TWO) check(`${name}(${a}, ${b})`, f(a, b), want);
  return out;
}

/** The known sqrt answers, for the test that proves them correctly rounded. */
export const KNOWN_SQRT = SQRT;
