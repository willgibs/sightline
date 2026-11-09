import type { GenTuning } from '../../config/tuning';
import { Blocks, type ColliderSet, type RayHit } from '../kernel/world/colliders';
import { Cell, cellIndex, type GridLayer } from '../kernel/world/grid';
import type { Heightfield } from '../kernel/world/heightfield';
import type { Camp } from './camp';
import { canopyOf, type Canopy, type Tree } from './props';

/**
 * The analysis raster (D7): the camp as lab D's analyses see it, one grid shared by all of
 * them. It lies in the camp's own frame, where every wall, container and doorway is
 * aligned with its cells, so a 0.2 m wall fills a column of cells and a doorway is a gap in
 * it, at any angle the camp stands to the world.
 *
 * Each cell holds, in two and a half dimensions:
 * - the ground's height;
 * - `top`, the top of whatever stands on the ground there and stops sight (a wall, a
 *   container, a crate), or the ground if nothing does;
 * - an overhead slab that stops sight, `lo` to `hi` (a roof, a tower's deck, a lintel), or
 *   none (lo > hi): a line passes under a roof but not through it;
 * - whether a body can stand there, and cross to each side neighbour (from the spatial
 *   grid's site layer, which knows doorways to the half metre).
 *
 * Doorways are carved open after the walls, with their lintels as slabs, so guards inside a
 * building see out of its doors and nothing else. The props outside are rasterized by their
 * bounding boxes, which errs toward blocking.
 */
export interface Raster {
  /** The camp's frame: its centre, and its axes (u toward the gate, v across). */
  ox: number;
  oz: number;
  ux: number;
  uz: number;
  vx: number;
  vz: number;
  /** Cell (i, j) covers a in [a0 + i·cell, a0 + (i + 1)·cell), b likewise from b0. */
  a0: number;
  b0: number;
  cell: number;
  /** The tree crowns over the whole map: what a perch's view has to clear on the way here. */
  canopy: Canopy;
  na: number;
  nb: number;
  ground: Float32Array;
  top: Float32Array;
  lo: Float32Array;
  hi: Float32Array;
  walk: Uint8Array;
  /** Move bits to the side neighbours: 1 (+a), 2 (+b), 4 (−a), 8 (−b). */
  moves: Uint8Array;
}

export const MOVE_BITS = [1, 2, 4, 8] as const;
export const MOVE_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/** Builds the raster over the camp and the analysis margin around its fence. */
export function buildRaster(camp: Camp, hf: Heightfield, colliders: ColliderSet, layer: GridLayer, gen: GenTuning, trees: readonly Tree[]): Raster {
  const { cell, margin } = gen.analysis;
  const L = camp.layout!;
  const site = camp.site;
  const halfA = L.halfA + margin;
  const halfB = L.halfB + margin;
  const na = Math.ceil((2 * halfA) / cell);
  const nb = Math.ceil((2 * halfB) / cell);
  const n = na * nb;
  const R: Raster = {
    ox: site.x,
    oz: site.z,
    ux: L.ux,
    uz: L.uz,
    vx: L.vx,
    vz: L.vz,
    a0: -halfA,
    b0: -halfB,
    cell,
    canopy: canopyOf(trees, hf.size, gen),
    na,
    nb,
    ground: new Float32Array(n),
    top: new Float32Array(n),
    lo: new Float32Array(n).fill(Infinity),
    hi: new Float32Array(n).fill(-Infinity),
    walk: new Uint8Array(n),
    moves: new Uint8Array(n),
  };
  for (let j = 0; j < nb; j++) {
    for (let i = 0; i < na; i++) {
      const p = worldOf(R, i + 0.5, j + 0.5);
      const g = hf.heightAt(p.x, p.z);
      R.ground[j * na + i] = g;
      R.top[j * na + i] = g;
    }
  }
  // Everything that stops sight, by its footprint's extent in the camp's frame. A certified
  // way in must not lean on a cell's whole width where the thing only clips it, so a thing
  // wider than a cell fills the cells whose centres it covers, and a thinner one (a wall)
  // just the row of cells its centre line runs through.
  const span = (lo: number, hi: number, min: number, count: number): [number, number] => {
    if (hi - lo < cell) {
      const c = Math.floor(((lo + hi) / 2 - min) / cell);
      return [Math.max(0, c), Math.min(count - 1, c)];
    }
    return [Math.max(0, Math.ceil((lo - min) / cell - 0.5)), Math.min(count - 1, Math.floor((hi - min) / cell - 0.5))];
  };
  const stamp = (a0: number, a1: number, b0: number, b1: number, y0: number, y1: number, overhead: boolean) => {
    const [i0, i1] = span(a0, a1, R.a0, na);
    const [j0, j1] = span(b0, b1, R.b0, nb);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * na + i;
        if (!overhead && y0 <= R.ground[k]! + 0.5) R.top[k] = Math.max(R.top[k]!, y1);
        else {
          R.lo[k] = Math.min(R.lo[k]!, y0);
          R.hi[k] = Math.max(R.hi[k]!, y1);
        }
      }
    }
  };
  const minA = R.a0;
  const maxA = R.a0 + na * cell;
  const minB = R.b0;
  const maxB = R.b0 + nb * cell;
  // A tower is open under its roof: a guard on its deck sees out, and is seen, between the
  // parapet and the roof. A cell holds one overhead slab, so its deck, legs and parapet count
  // as solid from the ground up, and only its roof as the slab.
  const towerRoof = new Map<number, number>();
  for (const st of camp.structures) {
    if (st.kind !== 'tower') continue;
    let roof = -Infinity;
    for (const id of st.colliders) roof = Math.max(roof, colliders.list[id]!.y1);
    for (const id of st.colliders) towerRoof.set(id, roof);
  }
  for (const c of colliders.list) {
    if ((c.flags & Blocks.Sight) === 0) continue;
    const f = frameOf(R, c.x, c.z);
    let ea: number;
    let eb: number;
    if (c.kind === 'cyl') {
      ea = c.r;
      eb = c.r;
    } else {
      // A box's half-extents along the camp's axes: exact for the camp's own boxes, a bounding box for others.
      const du = c.ux * R.ux + c.uz * R.uz;
      const dv = c.ux * R.vx + c.uz * R.vz;
      ea = Math.abs(du) * c.hx + Math.abs(dv) * c.hz;
      eb = Math.abs(dv) * c.hx + Math.abs(du) * c.hz;
    }
    if (f.a + ea < minA || f.a - ea > maxA || f.b + eb < minB || f.b - eb > maxB) continue;
    const roof = towerRoof.get(c.id);
    stamp(f.a - ea, f.a + ea, f.b - eb, f.b + eb, roof !== undefined && c.y1 < roof - 0.5 ? -Infinity : c.y0, c.y1, false);
  }
  // Parked vehicles are entities, not colliders, but they stand there all mission.
  for (const v of camp.vehicles ?? []) {
    const f = frameOf(R, v.x, v.z);
    const du = Math.abs(v.fx * R.ux + v.fz * R.uz);
    const dv = Math.abs(v.fx * R.vx + v.fz * R.vz);
    const ea = du * (v.length / 2) + dv * (v.width / 2);
    const eb = dv * (v.length / 2) + du * (v.width / 2);
    stamp(f.a - ea, f.a + ea, f.b - eb, f.b + eb, v.y - 0.2, v.y + v.height, false);
  }
  // Doorways: carved out of their walls, the lintel left as a slab.
  for (const d of camp.doors ?? []) {
    const f = frameOf(R, d.x, d.z);
    const alongA = Math.abs(d.ux * R.ux + d.uz * R.uz) > 0.5;
    const w = d.width / 2 - 0.05;
    const t = 0.15;
    const [a0, a1, b0, b1] = alongA ? [f.a - w, f.a + w, f.b - t, f.b + t] : [f.a - t, f.a + t, f.b - w, f.b + w];
    const i0 = Math.max(0, Math.floor((a0 - R.a0) / cell));
    const i1 = Math.min(na - 1, Math.ceil((a1 - R.a0) / cell) - 1);
    const j0 = Math.max(0, Math.floor((b0 - R.b0) / cell));
    const j1 = Math.min(nb - 1, Math.ceil((b1 - R.b0) / cell) - 1);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * na + i;
        R.top[k] = R.ground[k]!;
        R.lo[k] = Math.min(R.lo[k]!, d.y + d.height);
      }
    }
  }
  // Where a body stands and goes: from the site layer, which knows the doorways' widths.
  const sub = [-0.25, 0.25];
  const walkAt = (x: number, z: number): boolean => {
    const c = cellIndex(layer, x, z);
    return c >= 0 && (layer.flags[c]! & Cell.Walkable) !== 0;
  };
  for (let j = 0; j < nb; j++) {
    for (let i = 0; i < na; i++) {
      let any = false;
      for (const sa of sub) for (const sb of sub) if (!any) {
        const p = worldOf(R, i + 0.5 + sa, j + 0.5 + sb);
        any = walkAt(p.x, p.z);
      }
      R.walk[j * na + i] = any ? 1 : 0;
    }
  }
  const clear = (i0: number, j0: number, i1: number, j1: number): boolean => {
    // Three straight lines across the shared side: through the middle and a quarter either way.
    for (const off of [0, -0.3, 0.3]) {
      const oi = j0 === j1 ? 0 : off;
      const oj = j0 === j1 ? off : 0;
      let ok = true;
      for (let s = 0; s <= 4 && ok; s++) {
        const t = s / 4;
        const p = worldOf(R, i0 + 0.5 + oi + (i1 - i0) * t, j0 + 0.5 + oj + (j1 - j0) * t);
        ok = walkAt(p.x, p.z);
      }
      if (ok) return true;
    }
    return false;
  };
  for (let j = 0; j < nb; j++) {
    for (let i = 0; i < na; i++) {
      const k = j * na + i;
      if (!R.walk[k]) continue;
      for (let d = 0; d < 4; d++) {
        const [di, dj] = MOVE_DIRS[d]!;
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= na || nj >= nb || !R.walk[nj * na + ni]) continue;
        if (clear(i, j, ni, nj)) R.moves[k] = R.moves[k]! | MOVE_BITS[d]!;
      }
    }
  }
  // Moves both ways or neither.
  for (let j = 0; j < nb; j++) {
    for (let i = 0; i < na; i++) {
      const k = j * na + i;
      for (let d = 0; d < 4; d++) {
        if ((R.moves[k]! & MOVE_BITS[d]!) === 0) continue;
        const [di, dj] = MOVE_DIRS[d]!;
        const o = (j + dj) * na + (i + di);
        if ((R.moves[o]! & MOVE_BITS[(d + 2) % 4]!) === 0) R.moves[k] = R.moves[k]! & ~MOVE_BITS[d]!;
      }
    }
  }
  return R;
}

/** The world point at fractional cell coordinates (i, j). */
export function worldOf(R: Raster, i: number, j: number): { x: number; z: number } {
  const a = R.a0 + i * R.cell;
  const b = R.b0 + j * R.cell;
  return { x: R.ox + R.ux * a + R.vx * b, z: R.oz + R.uz * a + R.vz * b };
}

/** A world point in the camp's frame. */
export function frameOf(R: Raster, x: number, z: number): { a: number; b: number } {
  const dx = x - R.ox;
  const dz = z - R.oz;
  return { a: dx * R.ux + dz * R.uz, b: dx * R.vx + dz * R.vz };
}

/** The cell holding a world point, or −1 outside the raster. */
export function cellOf(R: Raster, x: number, z: number): number {
  const f = frameOf(R, x, z);
  const i = Math.floor((f.a - R.a0) / R.cell);
  const j = Math.floor((f.b - R.b0) / R.cell);
  return i < 0 || j < 0 || i >= R.na || j >= R.nb ? -1 : j * R.na + i;
}

/** The middle of a cell, in the world, at its ground. */
export function centreOf(R: Raster, k: number): { x: number; y: number; z: number } {
  const i = k % R.na;
  const j = (k - i) / R.na;
  const p = worldOf(R, i + 0.5, j + 0.5);
  return { x: p.x, y: R.ground[k]!, z: p.z };
}

/**
 * Like lineOfSight, but a thin wall can't be slipped past at a corner of the cells: it
 * samples more finely and, where a step changes both cell indices, tests the two cells it
 * cut across. Sampling alone misses a row of one-cell-thick wall when the line crosses
 * near where two cell corners meet, and a search over many cells and moments will find
 * exactly those lines (a way in that "shoots" him through a wall). For the close shot,
 * where it decides who can be reached.
 */
export function lineOfSightStrict(R: Raster, ex: number, ey: number, ez: number, tx: number, ty: number, tz: number): boolean {
  const e = frameOf(R, ex, ez);
  const t = frameOf(R, tx, tz);
  const da = t.a - e.a;
  const db = t.b - e.b;
  const dist = Math.sqrt(da * da + db * db);
  if (dist < 0.6) return true;
  const step = R.cell * 0.25;
  const n = Math.ceil(dist / step);
  const k0 = Math.ceil(0.3 / step);
  const blocked = (i: number, j: number, y: number): boolean => {
    if (i < 0 || j < 0 || i >= R.na || j >= R.nb) return false;
    const k = j * R.na + i;
    return y < R.top[k]! || (y >= R.lo[k]! && y <= R.hi[k]!);
  };
  let pi = -1;
  let pj = -1;
  for (let s = k0; s <= n - k0; s++) {
    const f = s / n;
    const i = Math.floor((e.a + da * f - R.a0) / R.cell);
    const j = Math.floor((e.b + db * f - R.b0) / R.cell);
    const y = ey + (ty - ey) * f;
    if (blocked(i, j, y)) return false;
    if (pi >= 0 && i !== pi && j !== pj && (blocked(pi, j, y) || blocked(i, pj, y))) return false;
    pi = i;
    pj = j;
  }
  return true;
}

const clearShotHit: RayHit = { dist: Infinity, id: -1 };

/**
 * Whether a close shot between two points is really open: the strict line through the
 * raster, then the colliders' own raycast, so a way in can't end by shooting through a wall
 * the raster smeared. The first and last 0.3 m are the shooter's and the target's own.
 */
export function clearShot(R: Raster, colliders: ColliderSet, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  if (!lineOfSightStrict(R, ax, ay, az, bx, by, bz)) return false;
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d < 0.7) return true;
  const ux = dx / d;
  const uy = dy / d;
  const uz = dz / d;
  clearShotHit.id = -1;
  clearShotHit.dist = Infinity;
  colliders.raycast(ax + ux * 0.3, ay + uy * 0.3, az + uz * 0.3, ux, uy, uz, d - 0.6, Blocks.Sight, clearShotHit);
  return clearShotHit.id < 0;
}

/**
 * Whether the straight line from an eye to a point clears everything in the raster: the
 * ground, what stands on it, and any slab it would pass through. The first and last 0.3 m
 * are the eye's and the target's own.
 */
export function lineOfSight(R: Raster, ex: number, ey: number, ez: number, tx: number, ty: number, tz: number): boolean {
  const e = frameOf(R, ex, ez);
  const t = frameOf(R, tx, tz);
  const da = t.a - e.a;
  const db = t.b - e.b;
  const dist = Math.sqrt(da * da + db * db);
  if (dist < 0.6) return true;
  const step = R.cell * 0.5;
  const n = Math.ceil(dist / step);
  const k0 = Math.ceil(0.3 / step);
  for (let s = k0; s <= n - k0; s++) {
    const f = s / n;
    const i = Math.floor((e.a + da * f - R.a0) / R.cell);
    const j = Math.floor((e.b + db * f - R.b0) / R.cell);
    if (i < 0 || j < 0 || i >= R.na || j >= R.nb) continue;
    const k = j * R.na + i;
    const y = ey + (ty - ey) * f;
    if (y < R.top[k]! || (y >= R.lo[k]! && y <= R.hi[k]!)) return false;
  }
  return true;
}
