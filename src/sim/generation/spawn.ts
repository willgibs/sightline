import type { SpawnKind } from '../kernel/mission';
import { dtanDeg } from '../kernel/core/detmath';
import { Blocks, footprintContains, type ColliderSet } from '../kernel/world/colliders';
import { cellIndex, type GridLayer } from '../kernel/world/grid';
import { makeTerrainSample, type Heightfield } from '../kernel/world/heightfield';
import { GridSearch } from '../kernel/world/search';
import type { Perch } from './analysis';
import type { Site } from './site';
import type { TerrainFeatures } from './terrain';

/** Where the player starts, and the way they face. */
export interface Spawn {
  x: number;
  z: number;
  /** Initial facing as a unit vector. */
  faceX: number;
  faceZ: number;
  kind: SpawnKind;
}

/**
 * Overlook: just behind the best perch, facing the camp, so the first view is the
 * valley. Edge: at the end of the road where it leaves the play area. Either way facing
 * the camp's site.
 */
export function chooseSpawn(
  kind: SpawnKind,
  hf: Heightfield,
  features: TerrainFeatures,
  colliders: ColliderSet,
  report: { perches: Perch[] },
  playHalf: number,
  site: Site,
  map: GridLayer, start: { x: number; z: number } = site,
): Spawn {
  const sample = makeTerrainSample();
  // Not somewhere with no way down to the camp: a shelf in a gorge, the top of a scarp.
  let walk: GridSearch | null = null;
  const reachable = (x: number, z: number): boolean => {
    if (!walk) {
      walk = new GridSearch(map);
      walk.flood([cellIndex(map, start.x, start.z)], { maxExpansions: map.nx * map.nz });
    }
    const c = cellIndex(map, x, z);
    return c >= 0 && walk.cost[c]! >= 0;
  };
  const maxTan = dtanDeg(28);
  const ids: number[] = [];
  const clear = (x: number, z: number): boolean => {
    if (Math.abs(x) > playHalf - 2 || Math.abs(z) > playHalf - 2) return false;
    if (!reachable(x, z)) return false;
    hf.sample(x, z, sample);
    if (sample.slopeTan > maxTan) return false;
    colliders.query(x - 1.5, z - 1.5, x + 1.5, z + 1.5, ids);
    for (const id of ids) {
      const c = colliders.list[id]!;
      if (c.flags & Blocks.Move && footprintContains(c, x, z, 0.9)) return false;
    }
    return true;
  };
  /** Nearest clear spot to (x, z), searching outward in rings. */
  const settle = (x: number, z: number): { x: number; z: number } => {
    if (clear(x, z)) return { x, z };
    for (let r = 1; r <= 24; r += 1) {
      for (let k = 0; k < 16; k++) {
        const px = x + r * RING16[k]!.x;
        const pz = z + r * RING16[k]!.z;
        if (clear(px, pz)) return { x: px, z: pz };
      }
    }
    return { x, z };
  };
  const facing = (x: number, z: number) => {
    const dx = x - site.x;
    const dz = z - site.z;
    const l = Math.sqrt(dx * dx + dz * dz) || 1;
    return { faceX: -dx / l, faceZ: -dz / l };
  };

  const perches = kind === 'overlook' ? report.perches.filter((p) => reachable(p.x, p.z)) : [];
  if (perches.length > 0) {
    // Prefer a high perch at a classic engagement distance.
    let best = perches[0]!;
    let bestScore = -Infinity;
    for (const p of perches) {
      const range = p.dist >= 200 && p.dist <= 400 ? 1 : 0.6;
      const score = p.heightAbovePad * range;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    const ox = best.x - site.x;
    const oz = best.z - site.z;
    const l = Math.sqrt(ox * ox + oz * oz);
    const back = 5;
    const spot = settle(best.x + (ox / l) * back, best.z + (oz / l) * back);
    return { ...spot, ...facing(spot.x, spot.z), kind: 'overlook' };
  }

  // Edge: where the road crosses into the play area.
  const pts = features.road.points;
  let entry = pts[pts.length - 1]!;
  for (let k = pts.length - 1; k >= 0; k--) {
    const p = pts[k]!;
    if (Math.abs(p.x) < playHalf - 8 && Math.abs(p.z) < playHalf - 8) {
      entry = p;
      break;
    }
  }
  const spot = settle(entry.x, entry.z);
  return { ...spot, ...facing(spot.x, spot.z), kind: 'edge' };
}

const RING16 = [
  { x: 1, z: 0 },
  { x: 0.9238795325112867, z: 0.3826834323650898 },
  { x: 0.7071067811865476, z: 0.7071067811865476 },
  { x: 0.3826834323650898, z: 0.9238795325112867 },
  { x: 0, z: 1 },
  { x: -0.3826834323650898, z: 0.9238795325112867 },
  { x: -0.7071067811865476, z: 0.7071067811865476 },
  { x: -0.9238795325112867, z: 0.3826834323650898 },
  { x: -1, z: 0 },
  { x: -0.9238795325112867, z: -0.3826834323650898 },
  { x: -0.7071067811865476, z: -0.7071067811865476 },
  { x: -0.3826834323650898, z: -0.9238795325112867 },
  { x: 0, z: -1 },
  { x: 0.3826834323650898, z: -0.9238795325112867 },
  { x: 0.7071067811865476, z: -0.7071067811865476 },
  { x: 0.9238795325112867, z: -0.3826834323650898 },
];

