import { Blocks, type ColliderSet, type RayHit } from '../kernel/world/colliders';
import { Cell, cellIndex, type GridLayer, type Storey } from '../kernel/world/grid';
import type { Heightfield } from '../kernel/world/heightfield';
import type { Camp } from './camp';

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
 *   none (lo > hi): a line passes under a roof but not through it; and, on a camp with an
 *   upper floor, a second one (`lo2`, `hi2`), so a body upstairs is between a floor and a
 *   roof and a window is the gap between its sill and its head;
 * - whether a body can stand there, and cross to each side neighbour (from the spatial
 *   grid's site layer, which knows doorways to the half metre).
 *
 * Cells beyond the grid's na × nb are **extra cells**: the floors of upper storeys and the
 * treads of the stairs up to them, each with its own floor height (`ground`) and its own
 * links to other cells (`links`), so the searches and the exposure field (field.ts) reach
 * the upper floor by the same maths.
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
  na: number;
  nb: number;
  ground: Float32Array;
  top: Float32Array;
  lo: Float32Array;
  hi: Float32Array;
  /** A second overhead slab, above the first, on a camp with an upper floor. */
  lo2: Float32Array;
  hi2: Float32Array;
  walk: Uint8Array;
  /** Move bits to the side neighbours: 1 (+a), 2 (+b), 4 (−a), 8 (−b). */
  moves: Uint8Array;
  /** Extra cells after na·nb (upper floors, stair treads): their count, world positions, and every cell's links to others. */
  extra: number;
  exX: Float32Array;
  exZ: Float32Array;
  links: Map<number, number[]> | null;
}

export const MOVE_BITS = [1, 2, 4, 8] as const;
export const MOVE_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/**
 * Builds the raster over the camp and `margin` metres around its fence. `levels` is the
 * spatial grid's upper floors and stairs: on a camp with some, the raster gets their cells too.
 */
export function buildRaster(camp: Camp, hf: Heightfield, colliders: ColliderSet, layer: GridLayer, cell: number, margin: number, levels: { storeys: readonly Storey[] } = { storeys: [] }): Raster {
  const L = camp.layout!;
  const site = camp.site;
  const halfA = L.halfA + margin;
  const halfB = L.halfB + margin;
  const na = Math.ceil((2 * halfA) / cell);
  const nb = Math.ceil((2 * halfB) / cell);
  const grids = na * nb;
  // Extra cells: an upper floor's cells and its flights' treads, listed up front.
  const up = upperCells(camp, hf, levels, cell, -halfA, -halfB, L.ux, L.uz, L.vx, L.vz, site.x, site.z);
  const n = grids + up.count;
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
    na,
    nb,
    ground: new Float32Array(n),
    top: new Float32Array(n),
    lo: new Float32Array(n).fill(Infinity),
    hi: new Float32Array(n).fill(-Infinity),
    lo2: new Float32Array(n).fill(Infinity),
    hi2: new Float32Array(n).fill(-Infinity),
    walk: new Uint8Array(n),
    moves: new Uint8Array(n),
    extra: up.count,
    exX: new Float32Array(up.count),
    exZ: new Float32Array(up.count),
    links: null,
  };
  // Two slabs only where something can stand between them: a one-storey camp keeps its one slab exactly.
  const twoSlab = up.count > 0;
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
        else if (twoSlab) overheadSlab(R, k, y0, y1);
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
  if (up.count > 0) addUpperCells(R, up);
  return R;
}

/** An extra cell, as listed before the raster exists: where it is, how high its floor is, and its neighbours by index. */
interface ExtraCell {
  x: number;
  z: number;
  y: number;
}

interface UpperCells {
  count: number;
  cells: ExtraCell[];
  /** Links between extra cells (indices into `cells`) and ground cells' links (as raster cells, by foot). */
  pairs: Array<readonly [number, number]>;
  /** Ground raster cells to join: [ground cell's world point, extra index]. */
  joins: Array<{ x: number; z: number; extra: number }>;
}

/**
 * Lists the cells of a camp's upper floors and the treads of its stairs, in the raster's
 * frame: each upper floor's cells are the raster cells inside its building's footprint where
 * the grid's storey layer says a body can stand; each flight is a chain of cells from the
 * ground at its foot to the floor at its head, one per metre of run.
 */
function upperCells(camp: Camp, hf: Heightfield, levels: { storeys: readonly Storey[] }, cell: number, a0: number, b0: number, ux: number, uz: number, vx: number, vz: number, ox: number, oz: number): UpperCells {
  const out: UpperCells = { count: 0, cells: [], pairs: [], joins: [] };
  const L = camp.layout;
  if (!L || levels.storeys.length === 0) return out;
  const worldOfFrame = (a: number, b: number): { x: number; z: number } => ({ x: ox + ux * a + vx * b, z: oz + uz * a + vz * b });
  const frameOfWorld = (x: number, z: number): { a: number; b: number } => ({ a: (x - ox) * ux + (z - oz) * uz, b: (x - ox) * vx + (z - oz) * vz });
  const layerWalk = (layer: GridLayer, x: number, z: number): boolean => {
    const c = cellIndex(layer, x, z);
    return c >= 0 && (layer.flags[c]! & Cell.Walkable) !== 0;
  };
  for (const b of L.buildings) {
    if (b.storey < 0) continue;
    const storey = levels.storeys[b.storey]!;
    const f = frameOfWorld(b.x, b.z);
    const du = Math.abs(b.ux * ux + b.uz * uz);
    const dv = Math.abs(b.ux * vx + b.uz * vz);
    const ha = (du * b.length + dv * b.depth) / 2;
    const hb = (dv * b.length + du * b.depth) / 2;
    const index = new Map<number, number>();
    const iMin = Math.floor((f.a - ha - a0) / cell);
    const jMin = Math.floor((f.b - hb - b0) / cell);
    const iMax = Math.floor((f.a + ha - a0) / cell);
    const jMax = Math.floor((f.b + hb - b0) / cell);
    const sub = [-0.25, 0.25];
    for (let j = jMin; j <= jMax; j++) {
      for (let i = iMin; i <= iMax; i++) {
        const ca = a0 + (i + 0.5) * cell;
        const cb = b0 + (j + 0.5) * cell;
        if (Math.abs(ca - f.a) > ha || Math.abs(cb - f.b) > hb) continue;
        let any = false;
        for (const sa of sub) for (const sb of sub) if (!any) {
          const p = worldOfFrame(ca + sa * cell, cb + sb * cell);
          any = layerWalk(storey.layer, p.x, p.z);
        }
        if (!any) continue;
        const p = worldOfFrame(ca, cb);
        index.set(j * 100000 + i, out.cells.length);
        out.cells.push({ x: p.x, z: p.z, y: storey.y });
      }
    }
    // Links between floor cells that a body can walk between: three straight lines across
    // the shared side, as the ground's moves are found (a cell is a body's width of floor).
    for (const [key, e] of index) {
      const j = Math.floor(key / 100000);
      const i = key - j * 100000;
      for (const [nj, ni] of [[j, i + 1], [j + 1, i]] as const) {
        const other = index.get(nj * 100000 + ni);
        if (other === undefined) continue;
        const pa = out.cells[e]!;
        const pb = out.cells[other]!;
        const across = nj === j ? { x: vx, z: vz } : { x: ux, z: uz };
        let clear = false;
        for (const off of [0, -0.3, 0.3]) {
          if (clear) break;
          let ok = true;
          const ox2 = across.x * off * cell;
          const oz2 = across.z * off * cell;
          for (let s = 0; s <= 4 && ok; s++) ok = layerWalk(storey.layer, pa.x + ox2 + ((pb.x - pa.x) * s) / 4, pa.z + oz2 + ((pb.z - pa.z) * s) / 4);
          clear = ok;
        }
        if (clear) out.pairs.push([e, other]);
      }
    }
    // Its flights: a chain of cells from the ground at the foot to the floor at the head.
    for (const st of camp.stairs ?? []) {
      if (st.storey !== b.storey) continue;
      const len = Math.sqrt((st.headX - st.footX) * (st.headX - st.footX) + (st.headZ - st.footZ) * (st.headZ - st.footZ));
      const count = Math.max(2, Math.ceil(len / cell));
      const groundY = hf.heightAt(st.footX, st.footZ);
      const chain: number[] = [];
      for (let k = 0; k < count; k++) {
        const t = (k + 1) / (count + 1);
        chain.push(out.cells.length);
        out.cells.push({ x: st.footX + (st.headX - st.footX) * t, z: st.footZ + (st.headZ - st.footZ) * t, y: groundY + (storey.y - groundY) * t });
      }
      out.joins.push({ x: st.footX, z: st.footZ, extra: chain[0]! });
      for (let k = 0; k + 1 < count; k++) out.pairs.push([chain[k]!, chain[k + 1]!]);
      // The head joins the floor cell nearest it.
      let best = -1;
      let bestD = Infinity;
      for (const e of index.values()) {
        const c = out.cells[e]!;
        if (!layerWalk(storey.layer, c.x, c.z)) continue;
        const d = (c.x - st.headX) * (c.x - st.headX) + (c.z - st.headZ) * (c.z - st.headZ);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      if (best >= 0) out.pairs.push([chain[count - 1]!, best]);
    }
  }
  out.count = out.cells.length;
  return out;
}

function addUpperCells(R: Raster, up: UpperCells): void {
  const grids = R.na * R.nb;
  const links = new Map<number, number[]>();
  const link = (a: number, b: number): void => {
    let la = links.get(a);
    if (!la) links.set(a, (la = []));
    la.push(b);
    let lb = links.get(b);
    if (!lb) links.set(b, (lb = []));
    lb.push(a);
  };
  up.cells.forEach((e, k) => {
    const c = grids + k;
    R.exX[k] = e.x;
    R.exZ[k] = e.z;
    R.ground[c] = e.y;
    R.top[c] = e.y;
    R.walk[c] = 1;
  });
  for (const [a, b] of up.pairs) link(grids + a, grids + b);
  for (const j of up.joins) {
    // The stair's foot, on the ground cell nearest it that a body can stand on.
    const c = nearestWalkableCell(R, j.x, j.z, 3);
    if (c >= 0) link(c, grids + j.extra);
  }
  R.links = links;
}

/**
 * Puts one overhead piece in a cell, keeping up to two separate slabs: the lower in lo/hi,
 * the upper in lo2/hi2. Pieces that touch merge, so a thick wall stays one slab and a floor
 * under a roof stays two; more than two, and the upper two merge (that errs toward blocking).
 */
function overheadSlab(R: Raster, k: number, y0: number, y1: number): void {
  const merge = (a0: number, a1: number): void => {
    R.lo2[k] = Math.min(R.lo2[k]!, a0);
    R.hi2[k] = Math.max(R.hi2[k]!, a1);
  };
  if (R.lo[k]! > R.hi[k]!) {
    R.lo[k] = y0;
    R.hi[k] = y1;
    return;
  }
  // Touching or overlapping the lower slab: one slab.
  if (y0 <= R.hi[k]! + 0.05 && y1 >= R.lo[k]! - 0.05) {
    R.lo[k] = Math.min(R.lo[k]!, y0);
    R.hi[k] = Math.max(R.hi[k]!, y1);
    return;
  }
  if (y1 < R.lo[k]!) {
    // Below the lower slab: it takes the lower place, and what was lower moves up.
    merge(R.lo[k]!, R.hi[k]!);
    R.lo[k] = y0;
    R.hi[k] = y1;
    return;
  }
  merge(y0, y1);
}

/** The ground cell nearest a point that a body can stand on and walk away from, within `radius` cells, or −1. */
function nearestWalkableCell(R: Raster, x: number, z: number, radius: number): number {
  const c = cellOf(R, x, z);
  if (c < 0) return -1;
  if (R.walk[c] && R.moves[c]! !== 0) return c;
  const f = frameOf(R, x, z);
  const ci = Math.floor((f.a - R.a0) / R.cell);
  const cj = Math.floor((f.b - R.b0) / R.cell);
  let best = -1;
  let bestD = Infinity;
  for (let j = cj - radius; j <= cj + radius; j++) {
    for (let i = ci - radius; i <= ci + radius; i++) {
      if (i < 0 || j < 0 || i >= R.na || j >= R.nb) continue;
      const k = j * R.na + i;
      if (!R.walk[k] || R.moves[k] === 0) continue;
      const ca = R.a0 + (i + 0.5) * R.cell - f.a;
      const cb = R.b0 + (j + 0.5) * R.cell - f.b;
      const d = ca * ca + cb * cb;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
  }
  return best;
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
  if (k >= R.na * R.nb) {
    const e = k - R.na * R.nb;
    return { x: R.exX[e]!, y: R.ground[k]!, z: R.exZ[e]! };
  }
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
    return y < R.top[k]! || (y >= R.lo[k]! && y <= R.hi[k]!) || (y >= R.lo2[k]! && y <= R.hi2[k]!);
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
    if (y < R.top[k]! || (y >= R.lo[k]! && y <= R.hi[k]!) || (y >= R.lo2[k]! && y <= R.hi2[k]!)) return false;
  }
  return true;
}
