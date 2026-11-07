import type { Tuning } from '../../config/tuning';
import type { GuardSpawn } from '../gen/camp';
import type { World } from '../gen/world';
import type { BodyState } from '../motor/body';
import type { MoveIntent } from '../motor/motor';

/**
 * The perception boundary. A guard's brain (anything in src/sim/ai) decides from a
 * GuardMind and nothing else: his own body, his post and routine, the static world,
 * the time, and what he has perceived. Never another entity's true state: where the
 * player is reaches a brain only as a percept, through perception (lab A), with
 * perception's errors and delays. An architecture test keeps src/sim/ai from importing
 * the state, the simulation or the systems, and a no-omniscience test runs one scene
 * twice with the player in two places no guard can perceive: wherever two runs give a
 * guard the same mind, his decisions must match bit for bit.
 *
 * Labs A and E extend this: percepts take their real kinds, beliefs and orders arrive.
 * They extend the mind; they never hand a brain the state.
 */

export type EntityId = number;

/**
 * Something a guard sensed: what kind of stimulus, where it seemed to come from, how
 * strongly, and the event that caused it (for the debrief's chain of causes). Lab A
 * defines the kinds and fills these from perception.
 */
export interface Percept {
  kind: string;
  x: number;
  y: number;
  z: number;
  strength: number;
  cause: number;
}

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
