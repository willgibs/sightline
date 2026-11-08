import { dexp } from '../kernel/core/detmath';

/**
 * Triangulating a shot (E8): honest counter-sniping from bearings alone. Each guard who
 * heard a shot turns where it seemed to come from into a bearing with its own error; the
 * commander fuses them, in a fixed order, into an estimate with a stated uncertainty.
 *
 * The fusion is the plain Bayesian one, on a grid: every cell of a window around the camp
 * gets the likelihood that every bearing, with its stated error, pointed from its
 * listener to that cell, and the cell's prior (a ring of plausible perches around the
 * camp). A single bearing then means "somewhere along this line at a plausible range",
 * which a least-squares intersection can't say, and a far shot is a long ellipse without
 * special cases. The result is reduced to its mean and covariance: the ellipse the
 * commander and the marksmen use.
 *
 * Calibration is the point. With correct stated errors the ellipse contains the true
 * shooter at the two-dimensional Gaussian rates: about 39% inside one standard deviation,
 * about 86% inside two (the bench's target). Repeated shots from one place add their
 * bearings and the ellipse shrinks; a shooter who relocates falls outside it. Everything
 * is + − × ÷ and dexp, exact in every engine; the grid's size is the budget (rule 18).
 */

/** A bearing: where the listener stood, which way the shot seemed to come from, and how sure (radians, one standard deviation). */
export interface Bearing {
  x: number;
  z: number;
  /** Unit direction toward the apparent source. */
  ux: number;
  uz: number;
  sigma: number;
}

/**
 * A fused estimate: a position and its information matrix (the inverse of the
 * covariance), so an ellipse test is one quadratic form.
 */
export interface ShotEstimate {
  x: number;
  z: number;
  /** The information matrix, symmetric: [ixx ixz; ixz izz]. */
  ixx: number;
  ixz: number;
  izz: number;
  /**
   * The ellipse's stated levels: the Mahalanobis radii squared at which the posterior holds
   * 39.35% and 86.47% (for a Gaussian, 1 and 4), so the one- and two-sigma statements are
   * true of this estimate's own shape: a bearing's banana or a truncated range included.
   */
  m1: number;
  m2: number;
}

export function emptyEstimate(): ShotEstimate {
  return { x: 0, z: 0, ixx: 0, ixz: 0, izz: 0, m1: 1, m2: 4 };
}

/** The squared Mahalanobis distance of (x, z) from the estimate: under 1 and 4 for the one and two sigma ellipses. */
export function mahalanobis2(e: ShotEstimate, x: number, z: number): number {
  const dx = x - e.x;
  const dz = z - e.z;
  return e.ixx * dx * dx + 2 * e.ixz * dx * dz + e.izz * dz * dz;
}

/** True if (x, z) lies inside the estimate's one- or two-sigma ellipse: the statement the bench checks (39% and 86%). */
export function inEllipse(e: ShotEstimate, x: number, z: number, sigmas: 1 | 2): boolean {
  return mahalanobis2(e, x, z) <= (sigmas === 1 ? e.m1 : e.m2);
}

/** The ellipse's area at one standard deviation, square metres. */
export function ellipseArea(e: ShotEstimate): number {
  const det = e.ixx * e.izz - e.ixz * e.ixz;
  return det > 0 ? Math.PI / Math.sqrt(det) : Infinity;
}

/** The window and prior for fusing: a square grid around the camp, and a ring of plausible ranges in it. */
export interface FuseGrid {
  x: number;
  z: number;
  /** Half the window's width, metres. */
  half: number;
  /** Cells across the window. */
  cells: number;
  rangeMin: number;
  rangeMax: number;
}

const scratch: number[] = [];

/**
 * Fuses bearings over a grid around (grid.x, grid.z): the bearings' likelihood times a flat
 * prior on the ring from rangeMin to rangeMax around the grid's centre, in the order given.
 * Returns false (with `out` unchanged) if no cell has any likelihood.
 */
export function fuseBearings(bearings: readonly Bearing[], grid: FuseGrid, out: ShotEstimate): boolean {
  const n = grid.cells;
  const cell = (2 * grid.half) / n;
  const x0 = grid.x - grid.half + cell / 2;
  const z0 = grid.z - grid.half + cell / 2;
  scratch.length = n * n;
  let best = -Infinity;
  // Log-likelihood of every cell, then each cell's weight relative to the best.
  for (let j = 0; j < n; j++) {
    const z = z0 + j * cell;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * cell;
      const k = j * n + i;
      const gx = x - grid.x;
      const gz = z - grid.z;
      const r2 = gx * gx + gz * gz;
      if (r2 < grid.rangeMin * grid.rangeMin || r2 > grid.rangeMax * grid.rangeMax) {
        scratch[k] = -Infinity;
        continue;
      }
      let ll = 0;
      for (const b of bearings) {
        const dx = x - b.x;
        const dz = z - b.z;
        const along = b.ux * dx + b.uz * dz;
        if (along <= 0) {
          ll = -Infinity;
          break;
        }
        const across = b.ux * dz - b.uz * dx;
        // The angle off the bearing, as its tangent: exact for small errors, and far cells have no likelihood anyway.
        const t = across / along / b.sigma;
        ll -= 0.5 * t * t;
      }
      scratch[k] = ll;
      if (ll > best) best = ll;
    }
  }
  if (best === -Infinity) return false;
  let w = 0;
  let sx = 0;
  let sz = 0;
  let sxx = 0;
  let sxz = 0;
  let szz = 0;
  for (let j = 0; j < n; j++) {
    const z = z0 + j * cell;
    for (let i = 0; i < n; i++) {
      const ll = scratch[j * n + i]!;
      if (ll === -Infinity || ll - best < -40) continue;
      const x = x0 + i * cell;
      const p = dexp(ll - best);
      w += p;
      sx += p * x;
      sz += p * z;
      sxx += p * x * x;
      sxz += p * x * z;
      szz += p * z * z;
    }
  }
  const mx = sx / w;
  const mz = sz / w;
  // The covariance of the grid's posterior, floored at the cell's own variance.
  const floor = (cell * cell) / 12;
  const cxx = sxx / w - mx * mx + floor;
  const cxz = sxz / w - mx * mz;
  const czz = szz / w - mz * mz + floor;
  const det = cxx * czz - cxz * cxz;
  if (!(det > 0)) return false;
  out.x = mx;
  out.z = mz;
  out.ixx = czz / det;
  out.ixz = -cxz / det;
  out.izz = cxx / det;
  // The levels the ellipse states, from the posterior's own mass by Mahalanobis radius.
  hist.fill(0);
  const binsPerD2 = HIST_BINS / HIST_MAX;
  for (let j = 0; j < n; j++) {
    const z = z0 + j * cell;
    for (let i = 0; i < n; i++) {
      const ll = scratch[j * n + i]!;
      if (ll === -Infinity || ll - best < -40) continue;
      const x = x0 + i * cell;
      const p = dexp(ll - best);
      const dx = x - mx;
      const dz = z - mz;
      const d2 = out.ixx * dx * dx + 2 * out.ixz * dx * dz + out.izz * dz * dz;
      const k = Math.min(HIST_BINS - 1, Math.floor(d2 * binsPerD2));
      hist[k]! += p;
    }
  }
  let acc = 0;
  out.m1 = HIST_MAX;
  out.m2 = HIST_MAX;
  let found1 = false;
  for (let k = 0; k < HIST_BINS; k++) {
    acc += hist[k]!;
    const edge = (k + 1) / binsPerD2;
    if (!found1 && acc >= P1 * w) {
      out.m1 = edge;
      found1 = true;
    }
    if (acc >= P2 * w) {
      out.m2 = edge;
      break;
    }
  }
  return true;
}

/** Bins of the posterior's mass by squared Mahalanobis radius, up to a radius of 4 (d² = 16). */
const HIST_BINS = 256;
const HIST_MAX = 16;
const hist: number[] = new Array<number>(HIST_BINS).fill(0);
/** The share of a 2D Gaussian inside one and two standard deviations (39.35%, 86.47%). */
const P1 = 1 - 1 / Math.sqrt(2.718281828459045);
const P2 = 1 - 1 / (2.718281828459045 * 2.718281828459045);
