import { dexp } from '../kernel/core/detmath';
import type { World } from '../kernel/world/world';

/**
 * Foliage: bushes and canopies, which dim sight rather than block it. A line through a
 * volume keeps exp(−density × length) of what it carries, the length being the chord of
 * the line inside it. Sight in both directions takes the same chord, so foliage is
 * symmetric by construction: whatever hides you from a guard hides him from you as much.
 * The renderer draws the same volumes with the same law (render/foliageMeshes.ts), so
 * what you see through a bush is what a guard sees through it.
 *
 * Symmetric to the bit: `transmittance(a, b)` orders its two ends before computing, so it
 * runs the same arithmetic whichever end is the eye. A test holds it to that.
 *
 * Volumes are static parts of a world, by module augmentation (as generation adds the
 * camp), kept as plain data so the world's fingerprint covers them. A world without them
 * has no foliage: the procedural valley's bushes are still
 * opaque sight colliders, until perception joins the valley (A13) and generation hands
 * its props over as volumes.
 */

/** A volume of foliage: a vertical cylinder (a bush) or an upright cone (a conifer's canopy). */
export interface FoliageVolume {
  kind: 'cyl' | 'cone';
  /** Centre of the base. */
  x: number;
  z: number;
  /** Bottom and top heights: a cone's apex is at y1. */
  y0: number;
  y1: number;
  /** Radius: a cone's at its base. */
  r: number;
  /** How much it dims, per metre of line inside it. */
  density: number;
}

declare module '../kernel/world/world' {
  interface World {
    /**
     * Foliage that dims sight (perception/foliage.ts), as plain data so the world's
     * fingerprint covers it; none if absent. `foliageOf` gives it indexed.
     */
    foliage?: readonly FoliageVolume[];
  }
}

const CELL = 8;
const NONE: readonly number[] = Object.freeze([]);

/** A world's foliage volumes, indexed on a coarse grid of their footprints. */
export class Foliage {
  readonly volumes: readonly FoliageVolume[];
  /** The highest top of any volume: a line above it passes through none. */
  readonly top: number;
  private readonly x0: number;
  private readonly z0: number;
  private readonly nx: number;
  private readonly nz: number;
  private readonly cells: number[][];
  private readonly stamp: Uint32Array;
  private stampValue = 0;
  private readonly found: number[] = [];

  constructor(volumes: readonly FoliageVolume[]) {
    this.volumes = volumes.map((v) => ({ ...v }));
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    let top = -Infinity;
    for (const v of this.volumes) {
      x0 = Math.min(x0, v.x - v.r);
      z0 = Math.min(z0, v.z - v.r);
      x1 = Math.max(x1, v.x + v.r);
      z1 = Math.max(z1, v.z + v.r);
      top = Math.max(top, v.y1);
    }
    if (this.volumes.length === 0) {
      x0 = z0 = x1 = z1 = 0;
    }
    this.top = top;
    this.x0 = x0;
    this.z0 = z0;
    this.nx = Math.max(1, Math.ceil((x1 - x0) / CELL));
    this.nz = Math.max(1, Math.ceil((z1 - z0) / CELL));
    this.cells = Array.from({ length: this.nx * this.nz }, () => [] as number[]);
    this.volumes.forEach((v, id) => {
      const i0 = this.ci(v.x - v.r);
      const i1 = this.ci(v.x + v.r);
      const j0 = this.cj(v.z - v.r);
      const j1 = this.cj(v.z + v.r);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.cells[j * this.nx + i]!.push(id);
    });
    this.stamp = new Uint32Array(this.volumes.length);
  }

  private ci(x: number): number {
    const i = Math.floor((x - this.x0) / CELL);
    return i < 0 ? 0 : i >= this.nx ? this.nx - 1 : i;
  }

  private cj(z: number): number {
    const j = Math.floor((z - this.z0) / CELL);
    return j < 0 ? 0 : j >= this.nz ? this.nz - 1 : j;
  }

  /**
   * The share of sight that gets through the foliage between two points: 1 through none,
   * toward 0 through a lot. The same, bit for bit, whichever point is the eye.
   */
  transmittance(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
    const depth = this.opticalDepth(ax, ay, az, bx, by, bz);
    return depth === 0 ? 1 : dexp(-depth);
  }

  /** Density × length, summed over every volume the segment passes through: transmittance's exponent. */
  opticalDepth(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
    if (this.volumes.length === 0) return 0;
    // One order for the two ends, so both directions run the same arithmetic.
    if (ax > bx || (ax === bx && (ay > by || (ay === by && az > bz)))) {
      const tx = ax;
      const ty = ay;
      const tz = az;
      ax = bx;
      ay = by;
      az = bz;
      bx = tx;
      by = ty;
      bz = tz;
    }
    if (ay > this.top && by > this.top) return 0;
    const ids = this.candidates(ax, az, bx, bz);
    if (ids.length === 0) return 0;
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-9) return 0;
    const ux = dx / len;
    const uy = dy / len;
    const uz = dz / len;
    let depth = 0;
    for (const id of ids) {
      const v = this.volumes[id]!;
      const chord = v.kind === 'cyl' ? cylinderChord(v, ax, ay, az, ux, uy, uz, len) : coneChord(v, ax, ay, az, ux, uy, uz, len);
      if (chord > 0) depth += v.density * chord;
    }
    return depth;
  }

  /** The volumes whose footprint cells the segment's bounding box touches, in ascending id order. */
  private candidates(ax: number, az: number, bx: number, bz: number): readonly number[] {
    const i0 = this.ci(Math.min(ax, bx));
    const i1 = this.ci(Math.max(ax, bx));
    const j0 = this.cj(Math.min(az, bz));
    const j1 = this.cj(Math.max(az, bz));
    const out = this.found;
    out.length = 0;
    this.stampValue = (this.stampValue + 1) >>> 0;
    if (this.stampValue === 0) {
      this.stamp.fill(0);
      this.stampValue = 1;
    }
    const s = this.stampValue;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        for (const id of this.cells[j * this.nx + i]!) {
          if (this.stamp[id] === s) continue;
          this.stamp[id] = s;
          out.push(id);
        }
      }
    }
    if (out.length === 0) return NONE;
    // Summed in id order, so the total never depends on the order cells were visited.
    return out.sort((a, b) => a - b); // unique: volume ids
  }
}

const EMPTY = new Foliage([]);
const indexed = new WeakMap<readonly FoliageVolume[], Foliage>();

/**
 * A world's foliage, indexed: built the first time it's asked for and kept with the
 * world's list (a cache of static data, never state). None if the world has none.
 */
export function foliageOf(world: World): Foliage {
  const list = world.foliage;
  if (!list || list.length === 0) return EMPTY;
  let f = indexed.get(list);
  if (!f) indexed.set(list, (f = new Foliage(list)));
  return f;
}

/** Where a line's parameter t lies inside [y0, y1]: the slab of heights a volume spans. */
function slab(oy: number, uy: number, y0: number, y1: number, out: { t0: number; t1: number }): boolean {
  if (Math.abs(uy) < 1e-12) {
    if (oy < y0 || oy > y1) return false;
    out.t0 = -Infinity;
    out.t1 = Infinity;
    return true;
  }
  let a = (y0 - oy) / uy;
  let b = (y1 - oy) / uy;
  if (a > b) {
    const t = a;
    a = b;
    b = t;
  }
  out.t0 = a;
  out.t1 = b;
  return true;
}

const range = { t0: 0, t1: 0 };

/** The length of [t0, t1] ∩ [lo, hi], or 0. */
function overlap(t0: number, t1: number, lo: number, hi: number): number {
  const a = t0 > lo ? t0 : lo;
  const b = t1 < hi ? t1 : hi;
  return b > a ? b - a : 0;
}

/** Length of the segment from o along u (unit), for `len` metres, inside a vertical cylinder. */
export function cylinderChord(v: FoliageVolume, ox: number, oy: number, oz: number, ux: number, uy: number, uz: number, len: number): number {
  if (!slab(oy, uy, v.y0, v.y1, range)) return 0;
  const px = ox - v.x;
  const pz = oz - v.z;
  const a = ux * ux + uz * uz;
  const c = px * px + pz * pz - v.r * v.r;
  if (a < 1e-12) return c <= 0 ? overlap(range.t0, range.t1, 0, len) : 0;
  const b = px * ux + pz * uz;
  const disc = b * b - a * c;
  if (disc <= 0) return 0;
  const sq = Math.sqrt(disc);
  const t0 = (-b - sq) / a;
  const t1 = (-b + sq) / a;
  return overlap(t0 > range.t0 ? t0 : range.t0, t1 < range.t1 ? t1 : range.t1, 0, len);
}

/**
 * Length of the segment inside an upright cone, base radius r at y0, apex at y1. Inside is
 * where the distance from the axis is at most k·(y1 − y), k = r / (y1 − y0): a quadratic
 * in t, cut to the cone's heights. The truncated cone is convex, so at most one piece of
 * the quadratic's solution lies within its heights.
 */
export function coneChord(v: FoliageVolume, ox: number, oy: number, oz: number, ux: number, uy: number, uz: number, len: number): number {
  if (!slab(oy, uy, v.y0, v.y1, range)) return 0;
  const k = v.r / (v.y1 - v.y0);
  const k2 = k * k;
  const px = ox - v.x;
  const pz = oz - v.z;
  const h = v.y1 - oy;
  const A = ux * ux + uz * uz - k2 * uy * uy;
  const B = 2 * (px * ux + pz * uz + k2 * h * uy);
  const C = px * px + pz * pz - k2 * h * h;
  const lo = range.t0 > 0 ? range.t0 : 0;
  const hi = range.t1 < len ? range.t1 : len;
  if (hi <= lo) return 0;
  if (Math.abs(A) < 1e-12) {
    // Linear: B t + C ≤ 0.
    if (Math.abs(B) < 1e-12) return C <= 0 ? hi - lo : 0;
    const t = -C / B;
    return B > 0 ? overlap(-Infinity, t, lo, hi) : overlap(t, Infinity, lo, hi);
  }
  const disc = B * B - 4 * A * C;
  if (A > 0) {
    if (disc <= 0) return 0;
    const sq = Math.sqrt(disc);
    return overlap((-B - sq) / (2 * A), (-B + sq) / (2 * A), lo, hi);
  }
  // A < 0: inside outside the roots (or everywhere, with no roots); the heights keep only the lower nappe.
  if (disc <= 0) return hi - lo;
  const sq = Math.sqrt(disc);
  const r1 = (-B + sq) / (2 * A);
  const r2 = (-B - sq) / (2 * A);
  const t1 = r1 < r2 ? r1 : r2;
  const t2 = r1 < r2 ? r2 : r1;
  return overlap(-Infinity, t1, lo, hi) + overlap(t2, Infinity, lo, hi);
}
