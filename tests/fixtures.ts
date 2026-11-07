import { defaultTuning, type Tuning } from '../src/config/tuning';
import type { Camp, GuardSpawn } from '../src/sim/gen/camp';
import { buildRoutine, type Routine } from '../src/sim/gen/routine';
import { Rng } from '../src/sim/core/rng';
import { makePolyline } from '../src/sim/gen/paths';
import type { World } from '../src/sim/gen/world';
import { Blocks, ColliderSet, circleOverlaps, type ColliderInput } from '../src/sim/world/colliders';
import { Heightfield } from '../src/sim/world/heightfield';
import { Surface } from '../src/sim/world/surfaces';
import { missionSpec } from '../src/sim/mission';
import { buildGrid } from '../src/sim/world/grid';

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
  /** The spawn is meant to be on top of a collider (a roof, a crate). Otherwise a spawn that lands on one is an error. */
  spawnOnTop?: boolean;
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
  if (!opts.spawnOnTop) {
    // A spawn inside something solid puts the body on top of it, and a test then silently
    // checks the wrong thing. Make that a loud mistake instead.
    const sx = opts.spawn?.x ?? 0;
    const sz = opts.spawn?.z ?? 0;
    const ground = hf.heightAt(sx, sz);
    const T = defaultTuning.bodies.player;
    for (const c of colliders.list) {
      if ((c.flags & Blocks.Move) !== 0 && c.y1 > ground + T.stepHeight && c.y0 < ground + T.height.stand && circleOverlaps(c, sx, sz, T.radius)) {
        throw new Error(`testWorld: the spawn (${sx}, ${sz}) is inside collider ${c.id}; move it or pass spawnOnTop`);
      }
    }
  }
  const line = makePolyline([
    { x: size, z: size },
    { x: size + 1, z: size },
  ]);
  const half = size / 2;
  return {
    // The fine layer covers the whole test world.
    grid: buildGrid(hf, colliders, { minX: -half, minZ: -half, maxX: half, maxZ: half }, defaultTuning.gen),
    spec: missionSpec('TEST-0000', 'edge'),
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

/** A guard spawn for a hand-built camp, with its routine built the way generation builds it. */
export function testGuard(s: Omit<GuardSpawn, 'routine'>): GuardSpawn {
  const spawn: GuardSpawn = { ...s, routine: null as unknown as Routine };
  spawn.routine = buildRoutine(spawn, defaultTuning.gen.routines, new Rng('TEST-0000', 'routine').fork(`guard${s.id}`));
  return spawn;
}

export const NORTH = 0; // yaw facing -z
export const EAST = -Math.PI / 2; // yaw facing +x
