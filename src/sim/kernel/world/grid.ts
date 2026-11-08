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

export interface SpatialGrid {
  map: GridLayer;
  site: GridLayer;
}

const sample = makeTerrainSample();
const ids: number[] = [];

/** Builds both layers. `site` is the area the fine layer covers: the camp and a margin. */
export function buildGrid(terrain: Heightfield, colliders: ColliderSet, site: { minX: number; minZ: number; maxX: number; maxZ: number }, G: GenTuning): SpatialGrid {
  const map = layer(terrain.coord(0), terrain.coord(0), terrain.cell, terrain.cells, terrain.cells);
  const fine = G.grid.siteCell;
  const sx = Math.max(1, Math.ceil((site.maxX - site.minX) / fine));
  const sz = Math.max(1, Math.ceil((site.maxZ - site.minZ) / fine));
  const siteLayer = layer(site.minX, site.minZ, fine, sx, sz);
  fill(map, terrain, colliders, G);
  fill(siteLayer, terrain, colliders, G);
  return { map, site: siteLayer };
}

function layer(x0: number, z0: number, cell: number, nx: number, nz: number): GridLayer {
  return { x0, z0, cell, nx, nz, flags: new Uint8Array(nx * nz), cover: new Uint8Array(nx * nz), edges: new Uint8Array(nx * nz) };
}

function fill(L: GridLayer, terrain: Heightfield, colliders: ColliderSet, G: GenTuning): void {
  const B = G.grid;
  const tanMax = dtanDeg(G.walkableSlopeDeg);
  for (let j = 0; j < L.nz; j++) {
    for (let i = 0; i < L.nx; i++) {
      const x = L.x0 + (i + 0.5) * L.cell;
      const z = L.z0 + (j + 0.5) * L.cell;
      terrain.sample(x, z, sample);
      const ground = sample.height;
      let flags = sample.slopeTan > tanMax ? Cell.Steep : Cell.Walkable;
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
