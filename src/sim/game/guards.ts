import type { Tuning } from '../../config/tuning';
import { keepRoutine, standStill, type GuardMind, type Order } from '../brain';
import type { Percept } from '../perception';
import type { World } from '../kernel/world/world';
import { createBody, type BodyState } from '../body';
import type { GuardEntity } from './entities';
import type { Solids } from '../kernel/world/solids';

/**
 * Guards, before Phase 1 gives them senses and a brain: each keeps to his routine
 * (brain/routine.ts), a pure function of mission time, and moves with the shared motor
 * like the player, so he collides with the world, steps, slopes and makes footsteps
 * under the same rules. His brain decides from his mind alone (brain/mind.ts), in the
 * 'decide' phase, and its order moves him from the next tick (brain/orders.ts). Labs A
 * and E add perception and the brain that can pull a guard off his routine; a guard who
 * returns rejoins it where it says he should be.
 */
export interface GuardState {
  /** Which of the camp's guard spawns (world.camp.guards) this guard came from. */
  spawn: number;
  /** Head turn relative to the body. */
  headYaw: number;
  /** What his brain last ordered: carried out every tick until it orders something else. */
  order: Order;
}

/** A guard's starting state, from the camp's spawn at `index`: on his post, or on the deck of his tower. */
export function createGuard(world: World, solids: Solids, index: number, tuning: Tuning): { body: BodyState; guard: GuardState } {
  const s = world.camp.guards[index]!;
  const body = createBody(world, solids, tuning.bodies.guard, s.x, s.z, s.faceX, s.faceZ, s.y);
  return { body, guard: { spawn: index, headYaw: 0, order: standStill() } };
}


type Writable<T> = { -readonly [K in keyof T]: T[K] };

const NO_PERCEPTS: readonly Percept[] = [];

/**
 * What a guard's brain gets to decide from (brain/mind.ts): his own body, his post, the
 * static world, the time, and his percepts. Built here, on this side of the perception
 * boundary, from his own state and perception's output; the brain never sees the rest.
 * Writes into `out`, which is reused.
 */
export function guardMind(g: GuardEntity, world: World, tuning: Tuning, tick: number, out: Writable<GuardMind>): GuardMind {
  out.id = g.id;
  out.self = g.body;
  out.post = world.camp.guards[g.guard.spawn]!;
  out.world = world;
  out.tuning = tuning;
  out.tick = tick;
  out.time = tick / tuning.sim.tickHz;
  out.percepts = NO_PERCEPTS;
  return out;
}

/** A mind for guardMind to fill: every field is written on each use. */
export function emptyMind(): Writable<GuardMind> {
  const unset = null as never;
  return { id: 0, self: unset, post: unset, world: unset, tuning: unset, tick: 0, time: 0, percepts: NO_PERCEPTS };
}

/** Scratch: the mind a guard's brain decides from, rewritten for each decision. */
const mind = emptyMind();

/**
 * A guard's brain decides his order for `tick` (the one after now) from his mind alone:
 * today, keep to the routine. Writes the order into his state.
 */
export function think(g: GuardEntity, world: World, tuning: Tuning, tick: number): Order {
  return keepRoutine(guardMind(g, world, tuning, tick, mind), g.guard.order);
}
