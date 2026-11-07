import type { Surface } from './surfaces';

/**
 * Static collision shapes: oriented boxes and vertical cylinders.
 *
 * Each collider says what it blocks. A chain-link fence blocks movement but not sight
 * or bullets; a bush blocks sight only; a concrete wall blocks everything. Perception
 * (Phase 1) and ballistics use the same raycast with a different mask.
 */
export const Blocks = {
  Move: 1,
  Sight: 2,
  Bullet: 4,
  All: 7,
} as const;

interface ColliderBase {
  id: number;
  /** Centre x and z. */
  x: number;
  z: number;
  /** Bottom and top heights. */
  y0: number;
  y1: number;
  flags: number;
  surface: Surface;
}

/** A box rotated about the vertical axis. Its local x axis is (ux, uz), its local z axis (-uz, ux). */
export interface BoxCollider extends ColliderBase {
  kind: 'box';
  hx: number;
  hz: number;
  ux: number;
  uz: number;
}

export interface CylinderCollider extends ColliderBase {
  kind: 'cyl';
  r: number;
}

export type Collider = BoxCollider | CylinderCollider;
export type ColliderInput = Omit<BoxCollider, 'id'> | Omit<CylinderCollider, 'id'>;

export interface RayHit {
  dist: number;
  id: number;
}

/** Horizontal half-extent of a collider (radius of its footprint's bounding square). */
function footprintExtent(c: Collider): { ex: number; ez: number } {
  if (c.kind === 'cyl') return { ex: c.r, ez: c.r };
  const ex = Math.abs(c.ux) * c.hx + Math.abs(c.uz) * c.hz;
  const ez = Math.abs(c.uz) * c.hx + Math.abs(c.ux) * c.hz;
  return { ex, ez };
}

export class ColliderSet {
  readonly list: Collider[] = [];
  readonly gridCell = 8;
  private readonly min: number;
  private readonly cellsPerSide: number;
  private grid: number[][] = [];
  private stamp: Uint32Array = new Uint32Array(0);
  private stampValue = 0;

  constructor(worldSize: number) {
    this.min = -worldSize / 2;
    this.cellsPerSide = Math.ceil(worldSize / this.gridCell);
  }

  add(c: ColliderInput): number {
    const id = this.list.length;
    this.list.push({ ...c, id } as Collider);
    return id;
  }

  /** Builds the spatial grid. Call once after all colliders are added. */
  build(): void {
    const { cellsPerSide } = this;
    this.grid = Array.from({ length: cellsPerSide * cellsPerSide }, () => [] as number[]);
    for (const c of this.list) {
      const { ex, ez } = footprintExtent(c);
      const i0 = this.cellIndex(c.x - ex);
      const i1 = this.cellIndex(c.x + ex);
      const j0 = this.cellIndex(c.z - ez);
      const j1 = this.cellIndex(c.z + ez);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.grid[j * cellsPerSide + i]!.push(c.id);
    }
    this.stamp = new Uint32Array(this.list.length);
  }

  private cellIndex(v: number): number {
    const i = Math.floor((v - this.min) / this.gridCell);
    return i < 0 ? 0 : i >= this.cellsPerSide ? this.cellsPerSide - 1 : i;
  }

  private nextStamp(): number {
    this.stampValue = (this.stampValue + 1) >>> 0;
    if (this.stampValue === 0) {
      this.stamp.fill(0);
      this.stampValue = 1;
    }
    return this.stampValue;
  }

  /** Ids of colliders whose footprint may overlap the box [minX, maxX] × [minZ, maxZ]. */
  query(minX: number, minZ: number, maxX: number, maxZ: number, out: number[]): number[] {
    out.length = 0;
    const s = this.nextStamp();
    const i0 = this.cellIndex(minX);
    const i1 = this.cellIndex(maxX);
    const j0 = this.cellIndex(minZ);
    const j1 = this.cellIndex(maxZ);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const cell = this.grid[j * this.cellsPerSide + i]!;
        for (let k = 0; k < cell.length; k++) {
          const id = cell[k]!;
          if (this.stamp[id] === s) continue;
          this.stamp[id] = s;
          out.push(id);
        }
      }
    }
    return out;
  }

  /** Nearest collider hit by a normalised ray among those whose flags match `mask`. */
  raycast(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxDist: number,
    mask: number,
    out: RayHit,
  ): RayHit {
    out.dist = Infinity;
    out.id = -1;
    const cellSize = this.gridCell;
    const s = this.nextStamp();
    let i = this.cellIndex(ox);
    let j = this.cellIndex(oz);
    const stepI = dx > 0 ? 1 : -1;
    const stepJ = dz > 0 ? 1 : -1;
    const tDeltaX = Math.abs(dx) < 1e-12 ? Infinity : cellSize / Math.abs(dx);
    const tDeltaZ = Math.abs(dz) < 1e-12 ? Infinity : cellSize / Math.abs(dz);
    let tMaxX = Math.abs(dx) < 1e-12 ? Infinity : (this.min + (dx > 0 ? i + 1 : i) * cellSize - ox) / dx;
    let tMaxZ = Math.abs(dz) < 1e-12 ? Infinity : (this.min + (dz > 0 ? j + 1 : j) * cellSize - oz) / dz;
    for (;;) {
      const cell = this.grid[j * this.cellsPerSide + i]!;
      for (let k = 0; k < cell.length; k++) {
        const id = cell[k]!;
        if (this.stamp[id] === s) continue;
        this.stamp[id] = s;
        const c = this.list[id]!;
        if ((c.flags & mask) === 0) continue;
        const t = rayCollider(c, ox, oy, oz, dx, dy, dz);
        if (t >= 0 && t <= maxDist && t < out.dist) {
          out.dist = t;
          out.id = id;
        }
      }
      const tExit = Math.min(tMaxX, tMaxZ);
      // Nothing in a later cell can be closer than a hit already inside this one.
      if (out.dist <= tExit || tExit > maxDist) return out;
      if (tMaxX < tMaxZ) {
        i += stepI;
        if (i < 0 || i >= this.cellsPerSide) return out;
        tMaxX += tDeltaX;
      } else {
        j += stepJ;
        if (j < 0 || j >= this.cellsPerSide) return out;
        tMaxZ += tDeltaZ;
      }
    }
  }
}

/** Distance along a normalised ray to a collider, or -1. A ray starting inside returns 0. */
export function rayCollider(c: Collider, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number {
  let tIn = -Infinity;
  let tOut = Infinity;
  // Vertical slab.
  if (Math.abs(dy) < 1e-12) {
    if (oy < c.y0 || oy > c.y1) return -1;
  } else {
    let ta = (c.y0 - oy) / dy;
    let tb = (c.y1 - oy) / dy;
    if (ta > tb) [ta, tb] = [tb, ta];
    tIn = ta;
    tOut = tb;
  }
  const px = ox - c.x;
  const pz = oz - c.z;
  if (c.kind === 'cyl') {
    const a = dx * dx + dz * dz;
    const cc = px * px + pz * pz - c.r * c.r;
    if (a < 1e-12) {
      if (cc > 0) return -1;
    } else {
      const b = px * dx + pz * dz;
      const disc = b * b - a * cc;
      if (disc < 0) return -1;
      const sq = Math.sqrt(disc);
      const ta = (-b - sq) / a;
      const tb = (-b + sq) / a;
      if (ta > tIn) tIn = ta;
      if (tb < tOut) tOut = tb;
    }
  } else {
    // Into box space.
    const lx = px * c.ux + pz * c.uz;
    const lz = -px * c.uz + pz * c.ux;
    const ldx = dx * c.ux + dz * c.uz;
    const ldz = -dx * c.uz + dz * c.ux;
    if (Math.abs(ldx) < 1e-12) {
      if (lx < -c.hx || lx > c.hx) return -1;
    } else {
      let ta = (-c.hx - lx) / ldx;
      let tb = (c.hx - lx) / ldx;
      if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > tIn) tIn = ta;
      if (tb < tOut) tOut = tb;
    }
    if (Math.abs(ldz) < 1e-12) {
      if (lz < -c.hz || lz > c.hz) return -1;
    } else {
      let ta = (-c.hz - lz) / ldz;
      let tb = (c.hz - lz) / ldz;
      if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > tIn) tIn = ta;
      if (tb < tOut) tOut = tb;
    }
  }
  if (tIn > tOut || tOut < 0) return -1;
  return tIn > 0 ? tIn : 0;
}

/** True if the point (x, z) lies within a collider's footprint, grown by `pad`. */
export function footprintContains(c: Collider, x: number, z: number, pad: number): boolean {
  const px = x - c.x;
  const pz = z - c.z;
  if (c.kind === 'cyl') {
    const r = c.r + pad;
    return px * px + pz * pz <= r * r;
  }
  const lx = px * c.ux + pz * c.uz;
  const lz = -px * c.uz + pz * c.ux;
  return Math.abs(lx) <= c.hx + pad && Math.abs(lz) <= c.hz + pad;
}

/**
 * Pushes a circle (x, z, r) out of a collider's footprint. Writes the correction into
 * `out` and returns true when the circle overlapped.
 */
export function pushOutCircle(c: Collider, x: number, z: number, r: number, out: { x: number; z: number }): boolean {
  const px = x - c.x;
  const pz = z - c.z;
  if (c.kind === 'cyl') {
    const rr = c.r + r;
    const d2 = px * px + pz * pz;
    if (d2 >= rr * rr) return false;
    if (d2 < 1e-12) {
      out.x = rr;
      out.z = 0;
      return true;
    }
    const d = Math.sqrt(d2);
    const k = (rr - d) / d;
    out.x = px * k;
    out.z = pz * k;
    return true;
  }
  const lx = px * c.ux + pz * c.uz;
  const lz = -px * c.uz + pz * c.ux;
  const cx = lx < -c.hx ? -c.hx : lx > c.hx ? c.hx : lx;
  const cz = lz < -c.hz ? -c.hz : lz > c.hz ? c.hz : lz;
  const ex = lx - cx;
  const ez = lz - cz;
  const d2 = ex * ex + ez * ez;
  let mx: number;
  let mz: number;
  if (d2 > 1e-12) {
    if (d2 >= r * r) return false;
    const d = Math.sqrt(d2);
    const k = (r - d) / d;
    mx = ex * k;
    mz = ez * k;
  } else {
    // Centre inside the rectangle: leave along the shallowest axis.
    const penX = c.hx - Math.abs(lx);
    const penZ = c.hz - Math.abs(lz);
    if (penX < penZ) {
      mx = (lx >= 0 ? 1 : -1) * (penX + r);
      mz = 0;
    } else {
      mx = 0;
      mz = (lz >= 0 ? 1 : -1) * (penZ + r);
    }
  }
  out.x = mx * c.ux - mz * c.uz;
  out.z = mx * c.uz + mz * c.ux;
  return true;
}
