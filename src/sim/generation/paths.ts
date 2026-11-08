/**
 * Polylines in the ground plane: the creek and the road. Deterministic arithmetic only.
 */

export interface Point2 {
  x: number;
  z: number;
}

export interface Polyline {
  points: Point2[];
  /** Arc length at each point. */
  lengths: number[];
  total: number;
  /** Per-segment bounding boxes for fast rejection. */
  boxes: Float64Array;
}

export interface PathHit {
  dist: number;
  /** Arc length of the closest point. */
  s: number;
  x: number;
  z: number;
}

export function makePolyline(points: Point2[]): Polyline {
  const lengths = [0];
  const boxes = new Float64Array(Math.max(points.length - 1, 0) * 4);
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]!;
    const b = points[k]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    lengths.push(lengths[k - 1]! + Math.sqrt(dx * dx + dz * dz));
    boxes[(k - 1) * 4] = Math.min(a.x, b.x);
    boxes[(k - 1) * 4 + 1] = Math.min(a.z, b.z);
    boxes[(k - 1) * 4 + 2] = Math.max(a.x, b.x);
    boxes[(k - 1) * 4 + 3] = Math.max(a.z, b.z);
  }
  return { points, lengths, total: lengths[lengths.length - 1]!, boxes };
}

/**
 * Closest point on the polyline to (x, z), considering only segments within `maxDist`.
 * Returns dist = Infinity when nothing is that close.
 */
export function closestOnPolyline(line: Polyline, x: number, z: number, maxDist: number, out: PathHit): PathHit {
  out.dist = Infinity;
  out.s = 0;
  out.x = 0;
  out.z = 0;
  const { points, lengths, boxes } = line;
  let best2 = maxDist * maxDist;
  for (let k = 0; k < points.length - 1; k++) {
    const b = k * 4;
    if (x < boxes[b]! - maxDist || x > boxes[b + 2]! + maxDist || z < boxes[b + 1]! - maxDist || z > boxes[b + 3]! + maxDist) {
      continue;
    }
    const a = points[k]!;
    const c = points[k + 1]!;
    const sx = c.x - a.x;
    const sz = c.z - a.z;
    const len2 = sx * sx + sz * sz;
    let t = len2 > 1e-12 ? ((x - a.x) * sx + (z - a.z) * sz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a.x + sx * t;
    const pz = a.z + sz * t;
    const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d2 < best2) {
      best2 = d2;
      out.dist = Math.sqrt(d2);
      out.s = lengths[k]! + (lengths[k + 1]! - lengths[k]!) * t;
      out.x = px;
      out.z = pz;
    }
  }
  return out;
}

/**
 * A bucket grid over a polyline's segments, so distance queries near a long path test
 * only the few segments that can be within reach instead of all of them.
 */
export class PolylineIndex {
  private readonly cellSize: number;
  private readonly minX: number;
  private readonly minZ: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly buckets: number[][];

  constructor(
    readonly line: Polyline,
    readonly reach: number,
    cellSize = 32,
  ) {
    this.cellSize = cellSize;
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const p of line.points) {
      minX = Math.min(minX, p.x);
      minZ = Math.min(minZ, p.z);
      maxX = Math.max(maxX, p.x);
      maxZ = Math.max(maxZ, p.z);
    }
    this.minX = minX - reach;
    this.minZ = minZ - reach;
    this.cols = Math.max(1, Math.ceil((maxX + reach - this.minX) / cellSize));
    this.rows = Math.max(1, Math.ceil((maxZ + reach - this.minZ) / cellSize));
    this.buckets = Array.from({ length: this.cols * this.rows }, () => [] as number[]);
    const { boxes } = line;
    for (let k = 0; k < line.points.length - 1; k++) {
      const i0 = Math.floor((boxes[k * 4]! - reach - this.minX) / cellSize);
      const j0 = Math.floor((boxes[k * 4 + 1]! - reach - this.minZ) / cellSize);
      const i1 = Math.floor((boxes[k * 4 + 2]! + reach - this.minX) / cellSize);
      const j1 = Math.floor((boxes[k * 4 + 3]! + reach - this.minZ) / cellSize);
      for (let j = Math.max(0, j0); j <= Math.min(this.rows - 1, j1); j++) {
        for (let i = Math.max(0, i0); i <= Math.min(this.cols - 1, i1); i++) this.buckets[j * this.cols + i]!.push(k);
      }
    }
  }

  /** Like closestOnPolyline, limited to `reach` (or less), using the buckets. */
  closest(x: number, z: number, out: PathHit, maxDist = this.reach): PathHit {
    out.dist = Infinity;
    out.s = 0;
    out.x = 0;
    out.z = 0;
    const i = Math.floor((x - this.minX) / this.cellSize);
    const j = Math.floor((z - this.minZ) / this.cellSize);
    if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) return out;
    const bucket = this.buckets[j * this.cols + i]!;
    const { points, lengths } = this.line;
    let best2 = maxDist * maxDist;
    for (let b = 0; b < bucket.length; b++) {
      const k = bucket[b]!;
      const a = points[k]!;
      const c = points[k + 1]!;
      const sx = c.x - a.x;
      const sz = c.z - a.z;
      const len2 = sx * sx + sz * sz;
      let t = len2 > 1e-12 ? ((x - a.x) * sx + (z - a.z) * sz) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a.x + sx * t;
      const pz = a.z + sz * t;
      const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (d2 < best2) {
        best2 = d2;
        out.dist = Math.sqrt(d2);
        out.s = lengths[k]! + (lengths[k + 1]! - lengths[k]!) * t;
        out.x = px;
        out.z = pz;
      }
    }
    return out;
  }
}

/** Point at arc length s. */
export function pointAt(line: Polyline, s: number): Point2 {
  const { points, lengths } = line;
  if (s <= 0) return { ...points[0]! };
  for (let k = 1; k < points.length; k++) {
    if (lengths[k]! >= s) {
      const a = points[k - 1]!;
      const b = points[k]!;
      const seg = lengths[k]! - lengths[k - 1]!;
      const t = seg > 0 ? (s - lengths[k - 1]!) / seg : 0;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }
  }
  return { ...points[points.length - 1]! };
}

/** Uniform Catmull–Rom spline through the control points, `per` samples per span. */
export function catmullRom(ctrl: Point2[], per: number): Point2[] {
  const out: Point2[] = [];
  for (let k = 0; k < ctrl.length - 1; k++) {
    const p0 = ctrl[k - 1 < 0 ? 0 : k - 1]!;
    const p1 = ctrl[k]!;
    const p2 = ctrl[k + 1]!;
    const p3 = ctrl[k + 2 >= ctrl.length ? ctrl.length - 1 : k + 2]!;
    for (let s = 0; s < per; s++) {
      const t = s / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  out.push({ ...ctrl[ctrl.length - 1]! });
  return out;
}

/** The distance from a point to a segment, on the ground. */
export function segmentDistance(p: Point2, a: Point2, b: Point2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = a.x + dx * t - p.x;
  const z = a.z + dz * t - p.z;
  return Math.sqrt(x * x + z * z);
}
