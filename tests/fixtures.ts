import type { QueryBody, QueryView } from '../src/sim/world/query';
import { Solids } from '../src/sim/world/solids';
import { defaultTuning, type Tuning } from '../src/config/tuning';
import type { GuardSpawn } from '../src/sim/gen/camp';
import { buildRoutine, type Routine } from '../src/sim/gen/routine';
import { Rng } from '../src/sim/core/rng';
import type { World } from '../src/sim/gen/world';
import { Blocks, circleOverlaps, type ColliderInput } from '../src/sim/world/colliders';
import { Surface } from '../src/sim/world/surfaces';
import { buildWorld, type HandmadeSpec } from '../src/sim/gen/handmade';

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
  camp?: HandmadeSpec['camp'];
}

/** A small hand-built world for controller and collision tests (gen/handmade.ts). */
export function testWorld(opts: TestWorldOptions = {}): World {
  const world = buildWorld({ name: 'TEST-0000', ...opts }, defaultTuning.gen);
  if (!opts.spawnOnTop) {
    // A spawn inside something solid puts the body on top of it, and a test then silently
    // checks the wrong thing. Make that a loud mistake instead.
    const { x: sx, z: sz } = world.spawn;
    const ground = world.terrain.heightAt(sx, sz);
    const T = defaultTuning.bodies.player;
    for (const c of world.colliders.list) {
      if ((c.flags & Blocks.Move) !== 0 && c.y1 > ground + T.stepHeight && c.y0 < ground + T.height.stand && circleOverlaps(c, sx, sz, T.radius)) {
        throw new Error(`testWorld: the spawn (${sx}, ${sz}) is inside collider ${c.id}; move it or pass spawnOnTop`);
      }
    }
  }
  return world;
}

/** A guard spawn for a hand-built camp, with its routine built the way generation builds it. */
export function testGuard(s: Omit<GuardSpawn, 'routine'>): GuardSpawn {
  const spawn: GuardSpawn = { ...s, routine: null as unknown as Routine };
  spawn.routine = buildRoutine(spawn, defaultTuning.gen.routines, new Rng('TEST-0000', 'routine').fork(`guard${s.id}`));
  return spawn;
}

export const NORTH = 0; // yaw facing -z
export const EAST = -Math.PI / 2; // yaw facing +x

/** What queries look through in a world with no entities' shapes: its own colliders, and these bodies. */
export function viewOf(world: World, bodies: readonly QueryBody[] = []): QueryView {
  return { world, solids: new Solids(world.colliders), bodies };
}
