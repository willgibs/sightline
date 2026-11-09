import { dexp } from '../core/detmath';
import type { World } from './world';

/**
 * Foliage: bushes and canopies, which dim a line rather than end it. A line through a
 * volume keeps exp(−density × length) of what it carries, the length being the chord of
 * the line inside it. Sight in both directions takes the same chord, so foliage is
 * symmetric by construction: whatever hides you from a guard hides him from you as much.
 *
 * Symmetric to the bit: `opticalDepth(a, b)` orders its two ends before computing, so it
 * runs the same arithmetic whichever end is the eye. A test holds it to that.
 *
 * Volumes are static parts of a world, kept as plain data so the world's fingerprint covers
 * them. Two sets use this law. Perception's (perception/foliage.ts) dims sight, and the
 * renderer draws them by the same law. A generated world's tree crowns (World.crowns) also
 * end a line: a line through more of them than the world's `crownStop` is stopped there,
 * sight and bullets alike, so what you can't see through you can't shoot through. The crowns
 * are drawn as the trees they are (render/worldMeshes.ts).
 *
 * A long line must stay cheap: the world's whole forest is indexed, and a line looks only at
 * the cells it crosses, and of those only the ones whose foliage reaches its height.
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
  /** Per cell, the lowest bottom and the highest top of the volumes in it: a line clear of those misses them all. */
  private readonly lows: Float64Array;
  private readonly highs: Float64Array;
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
    this.lows = new Float64Array(this.nx * this.nz).fill(Infinity);
    this.highs = new Float64Array(this.nx * this.nz).fill(-Infinity);
    this.volumes.forEach((v, id) => {
      const i0 = this.ci(v.x - v.r);
      const i1 = this.ci(v.x + v.r);
      const j0 = this.cj(v.z - v.r);
      const j1 = this.cj(v.z + v.r);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const c = j * this.nx + i;
          this.cells[c]!.push(id);
          if (v.y0 < this.lows[c]!) this.lows[c] = v.y0;
          if (v.y1 > this.highs[c]!) this.highs[c] = v.y1;
        }
      }
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

  /**
   * Density × length, summed over every volume the segment passes through: transmittance's
   * exponent. With `open`, a volume either end is inside doesn't count: the line is from
   * someone with their head among the branches, who has parted them.
   */
  opticalDepth(ax: number, ay: number, az: number, bx: number, by: number, bz: number, open = false): number {
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
    const ids = this.candidates(ax, ay, az, bx, by, bz);
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
      if (open && (contains(v, ax, ay, az) || contains(v, bx, by, bz))) continue;
      const chord = v.kind === 'cyl' ? cylinderChord(v, ax, ay, az, ux, uy, uz, len) : coneChord(v, ax, ay, az, ux, uy, uz, len);
      if (chord > 0) depth += v.density * chord;
    }
    return depth;
  }

  /**
   * How far along a ray (`u` of unit length) its allowance of foliage runs out, or Infinity if
   * it gets through `len` metres with some to spare. `out.depth` is how much it went through
   * on the way, as far as it got. Whether it stops is exact; where, inside the volume that
   * finishes it, is near enough for a line that has to end somewhere. With `open`, a volume
   * the line starts inside doesn't count, as in `opticalDepth`.
   */
  stopAlong(ox: number, oy: number, oz: number, ux: number, uy: number, uz: number, len: number, allowance: number, out: { depth: number }, open = false): number {
    out.depth = 0;
    if (this.volumes.length === 0) return Infinity;
    const bx = ox + ux * len;
    const by = oy + uy * len;
    const bz = oz + uz * len;
    if (oy > this.top && by > this.top) return Infinity;
    const ids = this.candidates(ox, oy, oz, bx, by, bz);
    let depth = 0;
    for (const id of ids) {
      const v = this.volumes[id]!;
      if (open && contains(v, ox, oy, oz)) continue;
      const chord = v.kind === 'cyl' ? cylinderChord(v, ox, oy, oz, ux, uy, uz, len) : coneChord(v, ox, oy, oz, ux, uy, uz, len);
      if (chord > 0) depth += v.density * chord;
    }
    if (depth < allowance) {
      out.depth = depth;
      return Infinity;
    }
    out.depth = allowance;
    // It runs out somewhere: take the volumes in the order the ray meets them.
    const met: { id: number; at: number; depth: number; density: number }[] = [];
    for (const id of ids) {
      const v = this.volumes[id]!;
      if (open && contains(v, ox, oy, oz)) continue;
      const chord = v.kind === 'cyl' ? cylinderChord(v, ox, oy, oz, ux, uy, uz, len) : coneChord(v, ox, oy, oz, ux, uy, uz, len);
      if (chord > 0) met.push({ id, at: span.t0, depth: v.density * chord, density: v.density });
    }
    met.sort((a, b) => a.at - b.at || a.id - b.id);
    let used = 0;
    for (const m of met) {
      if (used + m.depth >= allowance) return m.at + (allowance - used) / m.density;
      used += m.depth;
    }
    return Infinity;
  }

  /**
   * The volumes in the cells a segment crosses, in ascending id order, leaving out cells whose
   * foliage is all above or below it there. A long diagonal's bounding box would be most of the map.
   */
  private candidates(ax: number, ay: number, az: number, bx: number, by: number, bz: number): readonly number[] {
    const out = this.found;
    out.length = 0;
    this.stampValue = (this.stampValue + 1) >>> 0;
    if (this.stampValue === 0) {
      this.stamp.fill(0);
      this.stampValue = 1;
    }
    const s = this.stampValue;
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const i0 = this.ci(Math.min(ax, bx));
    const i1 = this.ci(Math.max(ax, bx));
    for (let i = i0; i <= i1; i++) {
      // The part of the segment over this column of cells. The outermost columns run on
      // for ever, as a point beyond the grid counts as being in its nearest cell.
      let t0 = 0;
      let t1 = 1;
      if (dx !== 0) {
        const ta = ((i === 0 ? -Infinity : this.x0 + i * CELL) - ax) / dx;
        const tb = ((i === this.nx - 1 ? Infinity : this.x0 + (i + 1) * CELL) - ax) / dx;
        const near = ta < tb ? ta : tb;
        const far = ta < tb ? tb : ta;
        if (near > t0) t0 = near;
        if (far < t1) t1 = far;
      }
      const za = az + dz * t0;
      const zb = az + dz * t1;
      const ya = ay + dy * t0;
      const yb = ay + dy * t1;
      const low = ya < yb ? ya : yb;
      const high = ya < yb ? yb : ya;
      const j0 = this.cj(za < zb ? za : zb);
      const j1 = this.cj(za < zb ? zb : za);
      for (let j = j0; j <= j1; j++) {
        const c = j * this.nx + i;
        if (low > this.highs[c]! || high < this.lows[c]!) continue;
        for (const id of this.cells[c]!) {
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

/** A list of volumes, indexed: built the first time it's asked for and kept with the list (a cache of static data, never state). */
export function indexedFoliage(list: readonly FoliageVolume[] | undefined): Foliage {
  if (!list || list.length === 0) return EMPTY;
  let f = indexed.get(list);
  if (!f) indexed.set(list, (f = new Foliage(list)));
  return f;
}

/** A world's tree crowns, indexed; none if it has none. */
export function crownsOf(world: World): Foliage {
  return indexedFoliage(world.crowns);
}

/** Whether a point is inside a volume. */
function contains(v: FoliageVolume, x: number, y: number, z: number): boolean {
  if (y < v.y0 || y > v.y1) return false;
  const r = v.kind === 'cyl' ? v.r : (v.r * (v.y1 - y)) / (v.y1 - v.y0);
  const dx = x - v.x;
  const dz = z - v.z;
  return dx * dx + dz * dz <= r * r;
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
/** Where along the line the last chord began. */
const span = { t0: 0 };

/** The length of [t0, t1] ∩ [lo, hi], or 0. */
function overlap(t0: number, t1: number, lo: number, hi: number): number {
  const a = t0 > lo ? t0 : lo;
  const b = t1 < hi ? t1 : hi;
  span.t0 = a;
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
    if (Math.abs(B) < 1e-12) return C <= 0 ? overlap(lo, hi, lo, hi) : 0;
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
  if (disc <= 0) return overlap(lo, hi, lo, hi);
  const sq = Math.sqrt(disc);
  const r1 = (-B + sq) / (2 * A);
  const r2 = (-B - sq) / (2 * A);
  const t1 = r1 < r2 ? r1 : r2;
  const t2 = r1 < r2 ? r2 : r1;
  const before = overlap(-Infinity, t1, lo, hi);
  const entry = span.t0;
  const after = overlap(t2, Infinity, lo, hi);
  if (before > 0) span.t0 = entry;
  return before + after;
}
