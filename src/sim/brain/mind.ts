import type { Tuning } from '../../config/tuning';
import type { GuardSpawn } from '../generation';
import type { World } from '../kernel/world/world';
import type { BodyState } from '../body';
import type { AwarenessState, Belief, Percept } from '../perception';

/**
 * The perception boundary. A guard's brain (anything in the brain lane) decides from a
 * GuardMind and nothing else: his own body, his post and routine, the static world,
 * the time, and what he has perceived. Never another entity's true state: where the
 * player is reaches a brain only as a percept, through perception (lab A), with
 * perception's errors and delays. An architecture test keeps the brain lane from
 * importing the state, the simulation or the systems, and a no-omniscience test runs
 * one scene twice with the player in two places no guard can perceive: wherever two
 * runs give a guard the same mind, his decisions must match bit for bit.
 *
 * A brain decides in the 'decide' phase and steers its body only through its order
 * (orders.ts), which moves the body from the next tick. Labs A and E extend the mind:
 * percepts take their real kinds, and beliefs arrive. They never hand a brain the state.
 */

export type EntityId = number;

export interface GuardMind {
  /** Who he is. */
  readonly id: EntityId;
  /** His own body, as he feels it. */
  readonly self: Readonly<Pick<BodyState, 'x' | 'y' | 'z' | 'yaw' | 'pitch' | 'stance' | 'speed' | 'motor'>>;
  /** His post: where he spawned, his route and his routine (from the camp, static). */
  readonly post: GuardSpawn;
  /** The static world: terrain, colliders, grid, the camp's layout. */
  readonly world: World;
  readonly tuning: Tuning;
  /** The tick being decided (the one after this), and its end in mission seconds. */
  readonly tick: number;
  readonly time: number;
  /** His head turn now, relative to his body. */
  readonly head: number;
  /** What he has sensed and not yet forgotten (perception's output), oldest first. */
  readonly percepts: readonly Percept[];
  /** His place on the awareness ladder (perception): since when, and where his attention is. */
  readonly awareness: Readonly<MindAwareness>;
  /** Where he believes the intruder is, and how sure: null until he has sensed one. */
  readonly belief: Readonly<Belief> | null;
}

/** A mind's awareness: the state, the tick he entered it, and his focus, if any (perception/senses.ts). */
export interface MindAwareness {
  state: AwarenessState;
  since: number;
  focus: boolean;
  fx: number;
  fy: number;
  fz: number;
}

