import { defaultTuning, type Tuning } from '../src/config/tuning';
import type { Camp } from '../src/sim/gen/camp';
import { makePolyline } from '../src/sim/gen/paths';
import type { World } from '../src/sim/gen/world';
import { ColliderSet, type ColliderInput } from '../src/sim/world/colliders';
import { Heightfield } from '../src/sim/world/heightfield';
import { Surface } from '../src/sim/world/surfaces';

/** A deep copy of the default tuning that tests can change freely. */
export function tuningCopy(): Tuning {
  return structuredClone(defaultTuning);
}

export interface TestWorldOptions {
  size?: number;
  cell?: number;
  height?: (x: number, z: number) => number;
  surface?: Surface;
  colliders?: ColliderInput[];
  spawn?: { x: number; z: number; faceX?: number; faceZ?: number };
  camp?: Camp;
}

/** A small hand-built world for controller and collision tests. */
export function testWorld(opts: TestWorldOptions = {}): World {
  const size = opts.size ?? 200;
  const hf = new Heightfield(size, opts.cell ?? 2);
  for (let j = 0; j < hf.n; j++) {
    for (let i = 0; i < hf.n; i++) {
      hf.heights[j * hf.n + i] = opts.height ? opts.height(hf.coord(i), hf.coord(j)) : 0;
    }
  }
  hf.surfaces.fill(opts.surface ?? Surface.Grass);
  hf.finalize();
  const colliders = new ColliderSet(size);
  for (const c of opts.colliders ?? []) colliders.add(c);
  colliders.build();
  const line = makePolyline([
    { x: size, z: size },
    { x: size + 1, z: size },
  ]);
  return {
    seed: 'TEST-0000',
    attempt: 0,
    terrain: hf,
    features: { saddles: [], passes: [], creek: line, road: line, creekPasses: [0, 1], roadPass: 0, campAxis: { x: 1, z: 0 } },
    backdrop: { size: 0, cell: 1, n: 0, heights: new Float32Array(0) },
    colliders,
    props: { trees: [], rocks: [], bushes: [] },
    camp: opts.camp ?? { structures: [], guards: [], fenceHalf: 0 },
    report: { perches: [], ridges: 0, overwatchSectors: 0, accessSectors: 0, steepShare: 0, ok: true, problems: [] },
    spawn: { x: opts.spawn?.x ?? 0, z: opts.spawn?.z ?? 0, faceX: opts.spawn?.faceX ?? 0, faceZ: opts.spawn?.faceZ ?? -1, kind: 'edge' },
    playHalf: size / 2 - 5,
    genMs: 0,
  };
}

export const NORTH = 0; // yaw facing -z
export const EAST = -Math.PI / 2; // yaw facing +x
