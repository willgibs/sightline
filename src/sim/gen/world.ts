import type { Tuning } from '../../config/tuning';
import type { MissionSpec } from '../mission';
import { dtanDeg } from '../core/detmath';
import { hashValue } from '../core/hash';
import { Rng } from '../core/rng';
import { Blocks, ColliderSet, footprintContains } from '../world/colliders';
import { makeTerrainSample, type Heightfield } from '../world/heightfield';
import { analyzeTerrain, type TerrainReport } from './analysis';
import { buildTestCamp, type Camp } from './camp';
import { scatterProps, type Props } from './props';
import { generateTerrain, type Backdrop, type TerrainFeatures } from './terrain';
import { assertTuning } from '../../config/validate';

/**
 * Everything static about a mission, built from the seed: terrain, cover, the camp,
 * guard posts and routes, the analysis report and the player's spawn.
 */
export interface World {
  /** What this world was built from. */
  spec: MissionSpec;
  seed: string;
  /** Re-rolls needed before the valley passed validation (0 = first try). */
  attempt: number;
  terrain: Heightfield;
  features: TerrainFeatures;
  backdrop: Backdrop;
  colliders: ColliderSet;
  props: Props;
  camp: Camp;
  report: TerrainReport;
  spawn: Spawn;
  /** Half-size of the playable square; beyond it is out of bounds. */
  playHalf: number;
  /** Generation time in milliseconds, if a clock was given (informational, not deterministic). */
  genMs: number;
}

export interface Spawn {
  x: number;
  z: number;
  /** Initial facing as a unit vector. */
  faceX: number;
  faceZ: number;
  kind: 'overlook' | 'edge';
}

export type SpawnKind = Spawn['kind'];

/** Everything generation reads from tuning. If this changes, the valley must be rebuilt. */
export function worldTuningKey(t: Tuning): string {
  return hashValue(t.gen);
}

/** Everything the running simulation reads from tuning: all of it except generation and view. */
export function simTuningKey(t: Tuning): string {
  const { gen: _gen, view: _view, ...simulation } = t;
  return hashValue(simulation);
}

/**
 * Builds a mission's world from its spec. Generation reads only `tuning.gen`. Pass a
 * clock (milliseconds) to have the generation time reported in `genMs`.
 */
export function generateWorld(spec: MissionSpec, tuning: Tuning, clock?: () => number): World {
  // Bounds on sizes, spacings and attempts, so bad tuning fails here instead of hanging.
  assertTuning(tuning);
  const started = clock ? clock() : 0;
  const G = tuning.gen;
  const seed = spec.seed;
  const attempts = Math.max(1, G.world.maxGenAttempts);
  for (let attempt = 0; ; attempt++) {
    const rng = new Rng(seed, attempt === 0 ? 'world' : `world#${attempt}`);
    const terrain = generateTerrain(rng.fork('terrain'), G);
    const colliders = new ColliderSet(G.world.size);
    const camp = buildTestCamp(rng.fork('camp'), terrain.heightfield, terrain.features, colliders, G);
    const props = scatterProps(rng.fork('props'), terrain.heightfield, terrain.features, colliders, G);
    colliders.build();
    const report = analyzeTerrain(terrain.heightfield, colliders, G);
    if (!report.ok && attempt < attempts - 1) continue;
    const playHalf = terrain.heightfield.size / 2 - G.world.playMargin;
    const spawn = chooseSpawn(spec.insertion, terrain.heightfield, terrain.features, colliders, report, playHalf);
    return {
      spec,
      seed,
      attempt,
      terrain: terrain.heightfield,
      features: terrain.features,
      backdrop: terrain.backdrop,
      colliders,
      props,
      camp,
      report,
      spawn,
      playHalf,
      genMs: clock ? clock() - started : 0,
    };
  }
}

/**
 * Overlook: just behind the best perch, facing the camp, so the first view is the
 * valley. Edge: at the end of the road where it leaves the play area.
 */
function chooseSpawn(
  kind: SpawnKind,
  hf: Heightfield,
  features: TerrainFeatures,
  colliders: ColliderSet,
  report: TerrainReport,
  playHalf: number,
): Spawn {
  const sample = makeTerrainSample();
  const maxTan = dtanDeg(28);
  const ids: number[] = [];
  const clear = (x: number, z: number): boolean => {
    if (Math.abs(x) > playHalf - 2 || Math.abs(z) > playHalf - 2) return false;
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
    const l = Math.sqrt(x * x + z * z) || 1;
    return { faceX: -x / l, faceZ: -z / l };
  };

  if (kind === 'overlook' && report.perches.length > 0) {
    // Prefer a high perch at a classic engagement distance.
    let best = report.perches[0]!;
    let bestScore = -Infinity;
    for (const p of report.perches) {
      const range = p.dist >= 200 && p.dist <= 400 ? 1 : 0.6;
      const score = p.heightAbovePad * range;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    const l = Math.sqrt(best.x * best.x + best.z * best.z);
    const back = 5;
    const spot = settle(best.x + (best.x / l) * back, best.z + (best.z / l) * back);
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
