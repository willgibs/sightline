import type { Tuning } from '../../config/tuning';
import { Cell, cellIndex, type GridLayer } from '../kernel/world/grid';
import type { Ground } from './mind';

/**
 * The camp's search map (E4): one grid, owned by the camp, of where the intruder could
 * be. The Last of Us's search map, kept honest: it is fed only by reports. A report of
 * contact, a sound or a shot injects belief at where the speaker said; belief bleeds into
 * neighbouring cells over time at the speed an intruder could walk; and a report that a
 * place has been looked at clears the cells that can be seen from there.
 *
 * One grid per camp, not per guard: at most a few thousand numbers in the hashed state,
 * against the 410,000 that per-guard maps over a valley would need. It covers a window
 * around the camp; a shot's origin from a far ridge is the commander's ellipse (E8).
 */
export interface SearchMap {
  /** The window's corner, its cell size and its size in cells. */
  x0: number;
  z0: number;
  cell: number;
  n: number;
  /** Probability mass per cell, row by row: n × n numbers. */
  p: number[];
}

/** Scratch: last step's cells, rewritten by every spread: nothing is kept between calls. */
const scratch: number[] = [];

/** Which of a map's cells a body can stand in, for a world: a fact about its ground, worked out once for a map laid where this one is. */
interface Openness {
  x0: number;
  z0: number;
  cell: number;
  n: number;
  open: Uint8Array;
}

const opens = new WeakMap<Ground, Openness>();

function openness(m: SearchMap, world: Ground): Uint8Array {
  let o = opens.get(world);
  if (!o || o.x0 !== m.x0 || o.z0 !== m.z0 || o.cell !== m.cell || o.n !== m.n) {
    const open = new Uint8Array(m.n * m.n);
    for (let j = 0; j < m.n; j++) {
      for (let i = 0; i < m.n; i++) open[j * m.n + i] = walkable(world, m.x0 + (i + 0.5) * m.cell, m.z0 + (j + 0.5) * m.cell) ? 1 : 0;
    }
    o = { x0: m.x0, z0: m.z0, cell: m.cell, n: m.n, open };
    opens.set(world, o);
  }
  return o.open;
}

/** An empty map: a window centred on (cx, cz), `n` cells across. */
export function createSearchMap(cx: number, cz: number, n: number, cell: number): SearchMap {
  const half = (n * cell) / 2;
  return { x0: cx - half, z0: cz - half, cell, n, p: new Array<number>(n * n).fill(0) };
}

/** The total belief on the map, between 0 and 1: where it's been looked at, it has gone. */
export function mapMass(m: SearchMap): number {
  let s = 0;
  for (let k = 0; k < m.p.length; k++) s += m.p[k]!;
  return s;
}

/** The centre of a cell. */
export function cellCentre(m: SearchMap, k: number): { x: number; z: number } {
  const i = k % m.n;
  const j = (k - i) / m.n;
  return { x: m.x0 + (i + 0.5) * m.cell, z: m.z0 + (j + 0.5) * m.cell };
}

/**
 * Injects belief at (x, z), spread over `radius` metres: the report said "around here".
 * A cone of mass, centre weighted, normalized to `amount`.
 */
export function injectBelief(m: SearchMap, x: number, z: number, radius: number, amount: number): void {
  const r = Math.max(radius, m.cell);
  const i0 = Math.floor((x - m.x0) / m.cell);
  const j0 = Math.floor((z - m.z0) / m.cell);
  const reach = Math.ceil(r / m.cell);
  let total = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let dj = -reach; dj <= reach; dj++) {
      for (let di = -reach; di <= reach; di++) {
        const i = i0 + di;
        const j = j0 + dj;
        if (i < 0 || j < 0 || i >= m.n || j >= m.n) continue;
        const d2 = (di * m.cell) * (di * m.cell) + (dj * m.cell) * (dj * m.cell);
        if (d2 > r * r) continue;
        const w = 1 - Math.sqrt(d2) / r + 0.1;
        if (pass === 0) total += w;
        else m.p[j * m.n + i] = m.p[j * m.n + i]! + (amount * w) / total;
      }
    }
    if (pass === 0 && total === 0) return;
  }
  const mass = mapMass(m);
  if (mass > 1) for (let k = 0; k < m.p.length; k++) m.p[k]! /= mass;
}

/**
 * One spread: each cell gives `rate` of its belief to its open neighbours, walls and
 * off-map neighbours keeping theirs (the sum stays the same). Called at a fixed rate
 * (rule 17).
 */
export function spreadBelief(m: SearchMap, rate: number, world: Ground): void {
  const { n, p } = m;
  const open = openness(m, world);
  const out = scratch;
  out.length = p.length;
  out.fill(0);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const v = p[k]!;
      if (v === 0) continue;
      // Neighbours to bleed into: the open ones around, in a fixed order.
      let count = 0;
      for (let d = 0; d < DIRS.length; d += 2) {
        const ni = i + DIRS[d]!;
        const nj = j + DIRS[d + 1]!;
        if (ni >= 0 && nj >= 0 && ni < n && nj < n && open[nj * n + ni] !== 0) count++;
      }
      if (count === 0) {
        out[k] = out[k]! + v;
        continue;
      }
      const give = v * rate;
      out[k] = out[k]! + v - give;
      const each = give / count;
      for (let d = 0; d < DIRS.length; d += 2) {
        const ni = i + DIRS[d]!;
        const nj = j + DIRS[d + 1]!;
        if (ni >= 0 && nj >= 0 && ni < n && nj < n && open[nj * n + ni] !== 0) out[nj * n + ni] = out[nj * n + ni]! + each;
      }
    }
  }
  for (let k = 0; k < p.length; k++) p[k] = out[k]!;
}

const DIRS = [1, 0, 0, 1, -1, 0, 0, -1, 1, 1, -1, 1, -1, -1, 1, -1];

function walkable(world: Ground, x: number, z: number): boolean {
  const s = cellIndex(world.grid.site, x, z);
  const L: GridLayer = s >= 0 ? world.grid.site : world.grid.map;
  const k = s >= 0 ? s : cellIndex(L, x, z);
  return k >= 0 && (L.flags[k]! & Cell.Walkable) !== 0;
}

/**
 * Clears what a report says was looked at: the cells within `radius` of (x, z), and in
 * line of sight from there by the world's terrain and cover, lose belief. Rule 18: at
 * most `maxRays` cells are tested, nearest first in a fixed order.
 */
export function clearSeen(m: SearchMap, x: number, z: number, radius: number, world: Ground, tuning: Tuning, eyeHeight: number): void {
  const i0 = Math.floor((x - m.x0) / m.cell);
  const j0 = Math.floor((z - m.z0) / m.cell);
  const reach = Math.ceil(radius / m.cell);
  const budget = tuning.brain.searchMap.clearRays;
  let rays = 0;
  for (let d = 0; d <= reach && rays < budget; d++) {
    for (let dj = -d; dj <= d && rays < budget; dj++) {
      for (let di = -d; di <= d; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== d || rays >= budget) continue;
        const i = i0 + di;
        const j = j0 + dj;
        if (i < 0 || j < 0 || i >= m.n || j >= m.n) continue;
        const k = j * m.n + i;
        if (m.p[k]! === 0) continue;
        const cx = m.x0 + (i + 0.5) * m.cell;
        const cz = m.z0 + (j + 0.5) * m.cell;
        const dx = cx - x;
        const dz = cz - z;
        if (dx * dx + dz * dz > radius * radius) continue;
        rays++;
        if (seen(world, x, z, cx, cz, eyeHeight, tuning.brain.searchMap.seenStep, tuning.brain.searchMap.seenHeight)) m.p[k] = 0;
      }
    }
  }
}

/** True if a ground point can be seen across the terrain and cover from eye height at (x, z). */
function seen(world: Ground, x: number, z: number, cx: number, cz: number, eyeHeight: number, step: number, height: number): boolean {
  const ey = world.terrain.heightAt(x, z) + eyeHeight;
  const dx = cx - x;
  const dz = cz - z;
  const d = Math.sqrt(dx * dx + dz * dz);
  const n = Math.max(1, Math.floor(d / step));
  for (let s = 1; s < n; s++) {
    const f = s / n;
    const px = x + dx * f;
    const pz = z + dz * f;
    const ground = world.terrain.heightAt(px, pz);
    const k = cellIndex(world.grid.site, px, pz);
    const L = k >= 0 ? world.grid.site : world.grid.map;
    const c = k >= 0 ? k : cellIndex(L, px, pz);
    const top = c >= 0 ? L.cover[c]! / 10 : 0;
    const line = ey + (height + world.terrain.heightAt(cx, cz) - ey) * f;
    if (line < ground + top) return false;
  }
  return true;
}

/**
 * How spread out the belief is: the effective number of cells it covers, 1/Σp² after
 * normalizing, and the area that makes. A sharp belief is a few cells; one that has
 * bled everywhere is thousands.
 */
export function mapSpread(m: SearchMap): number {
  const mass = mapMass(m);
  if (mass <= 0) return 0;
  let sq = 0;
  for (let k = 0; k < m.p.length; k++) {
    const q = m.p[k]! / mass;
    sq += q * q;
  }
  return sq > 0 ? (1 / sq) * m.cell * m.cell : 0;
}

/**
 * The hottest open cell not within `avoid` metres of any point in `taken` (reports and
 * other searchers' assignments): where a searcher should look next. Null if the map
 * is empty.
 */
export function hottestCell(m: SearchMap, taken: readonly number[], avoid: number): { x: number; z: number; p: number } | null {
  let best = -1;
  let bestP = 0;
  for (let k = 0; k < m.p.length; k++) {
    const v = m.p[k]!;
    if (v <= bestP) continue;
    const c = cellCentre(m, k);
    let near = false;
    for (let t = 0; t + 1 < taken.length; t += 2) {
      const dx = c.x - taken[t]!;
      const dz = c.z - taken[t + 1]!;
      if (dx * dx + dz * dz < avoid * avoid) {
        near = true;
        break;
      }
    }
    if (near) continue;
    best = k;
    bestP = v;
  }
  if (best < 0) return null;
  const c = cellCentre(m, best);
  return { x: c.x, z: c.z, p: bestP };
}
