import type { GenTuning } from '../../config/tuning';
import { defaultEnv, type EnvSpec } from '../env';
import type { MissionSpec } from '../mission';
import { GEN_VERSION } from '../version';
import { Blocks, ColliderSet, type ColliderInput } from '../world/colliders';
import { buildGrid } from '../world/grid';
import { Heightfield } from '../world/heightfield';
import { Surface } from '../world/surfaces';
import type { Camp } from './camp';
import { siteAt, type Site } from './site';
import { makePolyline } from './paths';
import type { World } from './world';

/**
 * Worlds built by hand, for scenes and tests: terrain from a height function, colliders
 * placed directly, a camp given outright. A built world has everything a generated one
 * has, so the simulation, the queries, the renderer and the recorder can't tell them
 * apart. Like generation, the same description always builds the same world.
 */
export interface HandmadeSpec {
  /** Names the world: its mission spec says it was built by hand, under this name. */
  name: string;
  /** Side of the terrain square, metres (centred on the origin). */
  size?: number;
  /** Heightfield spacing, metres: fine for sharp features, coarse for wide ones. */
  cell?: number;
  height?: (x: number, z: number) => number;
  surface?: Surface | ((x: number, z: number) => Surface);
  colliders?: readonly ColliderInput[];
  /** Where the player starts, and the way they face (a unit vector; north by default). */
  spawn?: { x: number; z: number; faceX?: number; faceZ?: number };
  /** A camp, at a site of its own or at the origin. */
  camp?: Omit<Camp, 'site'> & { site?: Site };
  env?: EnvSpec;
}

/** The mission spec of a world built by hand. */
export function handmadeMission(name: string, env: EnvSpec = defaultEnv()): MissionSpec {
  return { seed: name, genVersion: GEN_VERSION, terrain: { kind: 'handmade', name }, insertion: 'edge', env };
}

export function buildWorld(spec: HandmadeSpec, gen: GenTuning): World {
  const size = spec.size ?? 200;
  const hf = new Heightfield(size, spec.cell ?? 2);
  for (let j = 0; j < hf.n; j++) {
    for (let i = 0; i < hf.n; i++) hf.heights[j * hf.n + i] = spec.height ? spec.height(hf.coord(i), hf.coord(j)) : 0;
  }
  const surface = spec.surface ?? Surface.Grass;
  if (typeof surface === 'number') {
    hf.surfaces.fill(surface);
  } else {
    // Surfaces are per vertex (a point takes its nearest vertex's).
    for (let j = 0; j < hf.n; j++) {
      for (let i = 0; i < hf.n; i++) hf.surfaces[j * hf.n + i] = surface(hf.coord(i), hf.coord(j));
    }
  }
  hf.finalize();
  const colliders = new ColliderSet(size);
  const site = spec.camp?.site ?? siteAt(0, 0);
  const camp: Camp = spec.camp ? { ...spec.camp, site, structures: [...spec.camp.structures] } : { site, structures: [], guards: [], fenceHalf: 0 };
  const owned = new Set(camp.structures.flatMap((st) => st.colliders));
  for (const c of spec.colliders ?? []) {
    const id = colliders.add(c);
    // Every collider is part of something the renderer draws: the camp's own, or a block
    // (a fence, if it doesn't stop sight).
    if (!owned.has(id)) camp.structures.push({ kind: c.kind === 'box' && (c.flags & Blocks.Sight) === 0 ? 'fence' : 'block', colliders: [id] });
  }
  colliders.build();
  // No creek or road: a stub line beyond the world's edge stands in for them.
  const line = makePolyline([
    { x: size, z: size },
    { x: size + 1, z: size },
  ]);
  const half = size / 2;
  return {
    // A built world is small: the fine layer covers all of it.
    grid: buildGrid(hf, colliders, { minX: -half, minZ: -half, maxX: half, maxZ: half }, gen),
    spec: handmadeMission(spec.name, spec.env),
    seed: spec.name,
    attempt: 0,
    terrain: hf,
    features: { saddles: [], passes: [], creek: line, road: line, creekPasses: [0, 1], roadPass: 0, site },
    backdrop: { size: 0, cell: 1, n: 0, heights: new Float32Array(0) },
    colliders,
    props: { trees: [], rocks: [], bushes: [] },
    camp,
    report: { perches: [], ridges: 0, overwatchSectors: 0, accessSectors: 0, steepShare: 0, ok: true, problems: [] },
    spawn: { x: spec.spawn?.x ?? 0, z: spec.spawn?.z ?? 0, faceX: spec.spawn?.faceX ?? 0, faceZ: spec.spawn?.faceZ ?? -1, kind: 'edge' },
    playHalf: half - 5,
    genMs: 0,
  };
}
