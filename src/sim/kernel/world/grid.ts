import type { GenTuning } from '../../../config/tuning';
import { dtanDeg } from '../core/detmath';
import { Blocks, footprintContains, type Collider, type ColliderSet } from './colliders';
import { makeTerrainSample, type Heightfield } from './heightfield';

/**
 * One grid of cells for walking, sound, cover and shelter, built with the world, so the
 * labs share one answer: sound travels where guards can walk (lab A), searches route
 * around what blocks them (lab E), infiltration paths and access checks agree (lab D).
 *
 * Two layers: a 2.5 m map layer over the whole terrain, lined up with its cells, and a
 * 0.5 m site layer over the camp, because a 2.5 m cell can't represent a 1 m doorway.
 * Each cell says whether a standing body fits there (walkable), whether a wall stops
 * sound there, whether it is roofed, and how tall the cover is; and whether a body can
 * walk from its centre to its east and north neighbours'. Those edges are what a planner
 * should follow: a fence thinner than a cell can sit between two cell centres that both
 * fit a body, and only the edge between them knows it's there. Doors and anything else
 * that changes during a mission will override cells from the simulation's state.
 *
 * Built for a standard human body (gen.grid), kept equal to the player's by a test.
 */

/** Edge bits: a body can walk from this cell's centre to its neighbour's. */
export const Edge = { East: 1, North: 2 } as const;

export const Cell = {
  /** A standing body fits here: ground not too steep, nothing solid in the way. */
  Walkable: 1,
  /** A wall or building stops sound here. */
  BlocksSound: 2,
  /** Something overhead: a roof, a deck. */
  Roofed: 4,
  /** Ground too steep to stand on. */
  Steep: 8,
} as const;

export interface GridLayer {
  /** World position of the corner of cell (0, 0). */
  x0: number;
  z0: number;
  cell: number;
  nx: number;
  nz: number;
  flags: Uint8Array;
  /** Height above the ground of the tallest thing in the cell that blocks sight, in decimetres. */
  cover: Uint8Array;
  /** Edge bits: Edge.East to cell (i + 1, j), Edge.North to cell (i, j + 1). */
  edges: Uint8Array;
}

/** A walkable storey above the ground: the floor of an upper level, as a small layer over its footprint. */
export interface Storey {
  layer: GridLayer;
  /** The height of its floor. */
  y: number;
}

/**
 * A stair: from a cell of the site layer to a cell of a storey's layer (`storey` is its index in
 * `storeys`, foot is a site cell, head is a storey cell), with the cost of the climb in
 * COST_PER_METRE units. A stair is a walk edge between levels, so a flood or a path crosses it
 * like any other move (search.ts).
 */
export interface Stair {
  storey: number;
  foot: number;
  head: number;
  cost: number;
  /**
   * The flight's own two ends, on its middle line: where a body steps on to it at the bottom
   * and off it at the top. The cells are the nearest to these, up to half a cell to one side,
   * and a flight is barely wider than a body: a walk from one cell's middle to the other's
   * runs into its wall or its rail.
   */
  footX: number;
  footZ: number;
  headX: number;
  headZ: number;
}

export interface SpatialGrid {
  map: GridLayer;
  site: GridLayer;
  /** Walkable floors above the ground, and the stairs joining them to it. Empty on a one-storey camp. */
  storeys: Storey[];
  stairs: Stair[];
}

/** What generation hands the grid: a floor's footprint and height. */
export interface StoreySpec {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  y: number;
}

/** A flight of stairs: where it starts and ends, and how far along it a body walks, metres. */
export interface StairSpec {
  storey: number;
  footX: number;
  footZ: number;
  headX: number;
  headZ: number;
  length: number;
}

const sample = makeTerrainSample();
const ids: number[] = [];

/**
 * Builds both layers, and a layer for each storey. `site` is the area the fine layer covers:
 * the camp and a margin. A storey's layer is laid on the site layer's cells, so the two line
 * up cell for cell, and a stair joins the cell of its foot to the cell of its head.
 */
export function buildGrid(terrain: Heightfield, colliders: ColliderSet, site: { minX: number; minZ: number; maxX: number; maxZ: number }, G: GenTuning, storeys: readonly StoreySpec[] = [], stairs: readonly StairSpec[] = []): SpatialGrid {
  const map = layer(terrain.coord(0), terrain.coord(0), terrain.cell, terrain.cells, terrain.cells);
  const fine = G.grid.siteCell;
  const sx = Math.max(1, Math.ceil((site.maxX - site.minX) / fine));
  const sz = Math.max(1, Math.ceil((site.maxZ - site.minZ) / fine));
  const siteLayer = layer(site.minX, site.minZ, fine, sx, sz);
  // A map cell is as big as the terrain's own, so it lies on two triangles and has to answer
  // for both. A site cell is a fifth as wide and still answers for the ground under its
  // middle: asking it for all of its ground moves the camp generation builds on about one
  // seed in ten, for a fault nobody has seen inside a camp (docs/decisions.md, Nov 13).
  fill(map, terrain, colliders, G, true);
  fill(siteLayer, terrain, colliders, G, false);
  const built = storeys.map((s): Storey => {
    // On the site layer's cell lines.
    const x0 = site.minX + Math.floor((s.minX - site.minX) / fine) * fine;
    const z0 = site.minZ + Math.floor((s.minZ - site.minZ) / fine) * fine;
    const L = layer(x0, z0, fine, Math.max(1, Math.ceil((s.maxX - x0) / fine)), Math.max(1, Math.ceil((s.maxZ - z0) / fine)));
    fillStorey(L, s.y, colliders, G);
    return { layer: L, y: s.y };
  });
  const joined = stairs.flatMap((st): Stair[] => {
    const up = built[st.storey];
    if (!up) throw new Error(`A stair to storey ${st.storey}, and there are ${built.length}`);
    const foot = nearestWalkableCell(siteLayer, st.footX, st.footZ);
    const head = nearestWalkableCell(up.layer, st.headX, st.headZ);
    if (foot < 0 || head < 0) return [];
    // Never less than a straight walk between the two cells would cost on one level, so the
    // estimate a path search aims by (search.ts) stays a lower bound across a flight.
    const di = Math.abs((foot % siteLayer.nx) - ((head % up.layer.nx) + Math.round((up.layer.x0 - siteLayer.x0) / fine)));
    const dj = Math.abs(Math.floor(foot / siteLayer.nx) - (Math.floor(head / up.layer.nx) + Math.round((up.layer.z0 - siteLayer.z0) / fine)));
    const lo = Math.min(di, dj);
    const level = (di + dj - 2 * lo) * Math.round(fine * 100) + lo * Math.round(fine * 100 * Math.SQRT2);
    return [{ storey: st.storey, foot, head, cost: Math.max(Math.ceil(st.length * 100), level), footX: st.footX, footZ: st.footZ, headX: st.headX, headZ: st.headZ }];
  });
  return { map, site: siteLayer, storeys: built, stairs: joined };
}

/** The walkable cell of a layer nearest a point, within a metre and a half, or −1. */
function nearestWalkableCell(L: GridLayer, x: number, z: number): number {
  let best = -1;
  let bestD = Infinity;
  const reach = Math.ceil(1.5 / L.cell);
  const ci = Math.floor((x - L.x0) / L.cell);
  const cj = Math.floor((z - L.z0) / L.cell);
  for (let j = cj - reach; j <= cj + reach; j++) {
    for (let i = ci - reach; i <= ci + reach; i++) {
      if (i < 0 || j < 0 || i >= L.nx || j >= L.nz) continue;
      const k = j * L.nx + i;
      if ((L.flags[k]! & Cell.Walkable) === 0) continue;
      const dx = L.x0 + (i + 0.5) * L.cell - x;
      const dz = L.z0 + (j + 0.5) * L.cell - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
  }
  return best;
}

/**
 * A storey's layer: a standing body fits on a floor at height y if something solid is under
 * the cell's centre at that height and nothing is in the way up to the top of its head. Its
 * walk edges are straight walks at that height. Otherwise as `fill`.
 */
function fillStorey(L: GridLayer, y: number, colliders: ColliderSet, G: GenTuning): void {
  const B = G.grid;
  for (let j = 0; j < L.nz; j++) {
    for (let i = 0; i < L.nx; i++) {
      const x = L.x0 + (i + 0.5) * L.cell;
      const z = L.z0 + (j + 0.5) * L.cell;
      let flags = 0;
      let cover = 0;
      let floored = false;
      let blocked = false;
      colliders.query(x - B.bodyRadius, z - B.bodyRadius, x + B.bodyRadius, z + B.bodyRadius, ids);
      for (let q = 0; q < ids.length; q++) {
        const c: Collider = colliders.list[ids[q]!]!;
        const over = footprintContains(c, x, z, 0);
        if (over && (c.flags & Blocks.Move) !== 0 && Math.abs(c.y1 - y) <= 0.06) floored = true;
        if ((c.flags & Blocks.Move) !== 0 && c.y1 > y + B.stepHeight && c.y0 < y + B.bodyHeight && footprintContains(c, x, z, B.bodyRadius)) blocked = true;
        if (!over) continue;
        if ((c.flags & Blocks.Sound) !== 0 && c.y0 < y + 0.5 && c.y1 > y + 2) flags |= Cell.BlocksSound;
        if (c.y0 >= y + 1.9) flags |= Cell.Roofed;
        if ((c.flags & Blocks.Sight) !== 0 && c.y0 < y + 0.5 && c.y1 > y) cover = Math.max(cover, Math.min(255, Math.round((c.y1 - y) * 10)));
      }
      const k = j * L.nx + i;
      L.flags[k] = floored && !blocked ? flags | Cell.Walkable : flags;
      L.cover[k] = cover;
    }
  }
  const step = Math.min(0.25, L.cell / 2);
  const n = Math.ceil(L.cell / step);
  for (let j = 0; j < L.nz; j++) {
    for (let i = 0; i < L.nx; i++) {
      const k = j * L.nx + i;
      if ((L.flags[k]! & Cell.Walkable) === 0) continue;
      const x = L.x0 + (i + 0.5) * L.cell;
      const z = L.z0 + (j + 0.5) * L.cell;
      colliders.query(x - B.bodyRadius, z - B.bodyRadius, x + L.cell + B.bodyRadius, z + L.cell + B.bodyRadius, ids);
      let edges = 0;
      if (i + 1 < L.nx && (L.flags[k + 1]! & Cell.Walkable) !== 0 && clearPathAt(colliders, y, x, z, L.cell, 0, n, B)) edges |= Edge.East;
      if (j + 1 < L.nz && (L.flags[k + L.nx]! & Cell.Walkable) !== 0 && clearPathAt(colliders, y, x, z, 0, L.cell, n, B)) edges |= Edge.North;
      L.edges[k] = edges;
    }
  }
}

/** As clearPath, at a fixed floor height. */
function clearPathAt(colliders: ColliderSet, y: number, x: number, z: number, dx: number, dz: number, n: number, B: GenTuning['grid']): boolean {
  if (ids.length === 0) return true;
  for (let s = 1; s < n; s++) {
    const px = x + (dx * s) / n;
    const pz = z + (dz * s) / n;
    for (let q = 0; q < ids.length; q++) {
      const c = colliders.list[ids[q]!]!;
      if ((c.flags & Blocks.Move) !== 0 && c.y1 > y + B.stepHeight && c.y0 < y + B.bodyHeight && footprintContains(c, px, pz, B.bodyRadius)) return false;
    }
  }
  return true;
}

function layer(x0: number, z0: number, cell: number, nx: number, nz: number): GridLayer {
  return { x0, z0, cell, nx, nz, flags: new Uint8Array(nx * nz), cover: new Uint8Array(nx * nz), edges: new Uint8Array(nx * nz) };
}

/**
 * Fills a layer's cells and edges. `whole`: a cell is steep if any triangle under it is,
 * and not only the one under its middle. The motor stops a body at whichever triangle it
 * steps on to, so a cell that answers for one of its two sends a walker up the other.
 */
function fill(L: GridLayer, terrain: Heightfield, colliders: ColliderSet, G: GenTuning, whole: boolean): void {
  const B = G.grid;
  const tanMax = dtanDeg(G.walkableSlopeDeg);
  for (let j = 0; j < L.nz; j++) {
    for (let i = 0; i < L.nx; i++) {
      const x = L.x0 + (i + 0.5) * L.cell;
      const z = L.z0 + (j + 0.5) * L.cell;
      terrain.sample(x, z, sample);
      const ground = sample.height;
      const steepest = whole ? terrain.steepestIn(L.x0 + i * L.cell, L.z0 + j * L.cell, L.x0 + (i + 1) * L.cell, L.z0 + (j + 1) * L.cell) : sample.slopeTan;
      let flags = steepest > tanMax ? Cell.Steep : Cell.Walkable;
      let cover = 0;
      colliders.query(x - B.bodyRadius, z - B.bodyRadius, x + B.bodyRadius, z + B.bodyRadius, ids);
      for (let q = 0; q < ids.length; q++) {
        const c: Collider = colliders.list[ids[q]!]!;
        const over = footprintContains(c, x, z, 0);
        // A body standing here: anything solid between a step up and the top of its head.
        if ((c.flags & Blocks.Move) !== 0 && c.y1 > ground + B.stepHeight && c.y0 < ground + B.bodyHeight && footprintContains(c, x, z, B.bodyRadius)) {
          flags &= ~Cell.Walkable;
        }
        if (!over) continue;
        if ((c.flags & Blocks.Sound) !== 0 && c.y0 < ground + 0.5 && c.y1 > ground + 2) flags |= Cell.BlocksSound;
        if (c.y0 >= ground + 1.9) flags |= Cell.Roofed;
        if ((c.flags & Blocks.Sight) !== 0 && c.y0 < ground + 0.5) cover = Math.max(cover, Math.min(255, Math.round((c.y1 - ground) * 10)));
      }
      const k = j * L.nx + i;
      L.flags[k] = flags;
      L.cover[k] = cover;
    }
  }
  // Edges: walk from each centre to the next, checking that a body fits all the way.
  const step = Math.min(0.25, L.cell / 2);
  const n = Math.ceil(L.cell / step);
  for (let j = 0; j < L.nz; j++) {
    for (let i = 0; i < L.nx; i++) {
      const k = j * L.nx + i;
      if ((L.flags[k]! & Cell.Walkable) === 0) continue;
      const x = L.x0 + (i + 0.5) * L.cell;
      const z = L.z0 + (j + 0.5) * L.cell;
      colliders.query(x - B.bodyRadius, z - B.bodyRadius, x + L.cell + B.bodyRadius, z + L.cell + B.bodyRadius, ids);
      let edges = 0;
      if (i + 1 < L.nx && (L.flags[k + 1]! & Cell.Walkable) !== 0 && clearPath(terrain, colliders, x, z, L.cell, 0, n, B)) edges |= Edge.East;
      if (j + 1 < L.nz && (L.flags[k + L.nx]! & Cell.Walkable) !== 0 && clearPath(terrain, colliders, x, z, 0, L.cell, n, B)) edges |= Edge.North;
      L.edges[k] = edges;
    }
  }
}

/** True if a body fits at every step from (x, z) to (x + dx, z + dz), among the colliders in `ids`. */
function clearPath(terrain: Heightfield, colliders: ColliderSet, x: number, z: number, dx: number, dz: number, n: number, B: GenTuning['grid']): boolean {
  if (ids.length === 0) return true;
  for (let s = 1; s < n; s++) {
    const px = x + (dx * s) / n;
    const pz = z + (dz * s) / n;
    const ground = terrain.heightAt(px, pz);
    for (let q = 0; q < ids.length; q++) {
      const c = colliders.list[ids[q]!]!;
      if ((c.flags & Blocks.Move) !== 0 && c.y1 > ground + B.stepHeight && c.y0 < ground + B.bodyHeight && footprintContains(c, px, pz, B.bodyRadius)) return false;
    }
  }
  return true;
}

/**
 * Which storey (index) a body with its feet at height y stands on at (x, z), or −1 for the
 * ground. On it is from the last tread of the flight up to it (0.4 m under the floor) to as far
 * above it as a floor's own headroom: a man on a tower's deck beside the building, or on its
 * roof, is over the floor's footprint and not on the floor.
 */
export function storeyAt(grid: SpatialGrid, x: number, y: number, z: number): number {
  for (let k = 0; k < grid.storeys.length; k++) {
    const s = grid.storeys[k]!;
    if (y >= s.y - 0.4 && y < s.y + STOREY_HEADROOM && cellIndex(s.layer, x, z) >= 0) return k;
  }
  return -1;
}

/** Metres above a storey's floor that a body's feet can be and still be on it. */
const STOREY_HEADROOM = 2.4;

/** The cell index of (x, z) in a layer, or −1 outside it. */
export function cellIndex(L: GridLayer, x: number, z: number): number {
  const i = Math.floor((x - L.x0) / L.cell);
  const j = Math.floor((z - L.z0) / L.cell);
  return i < 0 || j < 0 || i >= L.nx || j >= L.nz ? -1 : j * L.nx + i;
}

/** The finest cell at (x, z): the site layer's inside the site, the map layer's elsewhere. */
export function cellAt(grid: SpatialGrid, x: number, z: number): { layer: GridLayer; index: number } | null {
  const s = cellIndex(grid.site, x, z);
  if (s >= 0) return { layer: grid.site, index: s };
  const m = cellIndex(grid.map, x, z);
  return m >= 0 ? { layer: grid.map, index: m } : null;
}
