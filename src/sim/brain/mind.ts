import type { Tuning } from '../../config/tuning';
import type { GuardSpawn } from '../generation';
import type { World } from '../kernel/world/world';
import type { BodyState, MoveIntent } from '../body';
import type { Percept } from '../perception';

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
 * Labs A and E extend this: percepts take their real kinds, beliefs and orders arrive.
 * They extend the mind; they never hand a brain the state.
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
  /** The tick being decided, and its end in mission seconds. */
  readonly tick: number;
  readonly time: number;
  /** What he sensed this tick (perception's output); none until guards have senses (lab A). */
  readonly percepts: readonly Percept[];
}

/** What a brain decides for a tick: how to move, and where to turn his head relative to his body. */
export interface GuardDecision {
  move: MoveIntent;
  headYaw: number;
}
