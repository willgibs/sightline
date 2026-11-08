import type { Tuning } from '../../config/tuning';
import type { GuardSpawn } from '../generation';
import type { World } from '../kernel/world/world';
import type { BodyState } from '../body';
import type { AwarenessState, Belief, Percept } from '../perception';
import type { AlertReason } from '../kernel/events';
import type { SearchOptions } from '../kernel/world/search';
import type { BrainState } from './brain';

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
  /** His brain's memory: what he's doing and why (brain.ts). Null for a guard with no brain: he keeps to routine, or reacts as lab A's minimal reactions do. */
  readonly brain: BrainState | null;
  /** Where the camp's alarm boxes are: static knowledge, from the camp's layout (E7). */
  readonly alarms: readonly { x: number; z: number }[];
  /** Where the camp's escape vehicle stands, if it has one (static, like the alarm boxes): the target's way out at lockdown. */
  readonly escape: Readonly<{ x: number; z: number }> | null;
  /** A number in [0, 1) from his own stream: the only way a brain rolls dice (rule 3). */
  draw(): number;
  /** Counts the navigator's work, and how many route searches are left this tick. */
  readonly nav: NavAllowance;
}

/** What a brain may spend on routes in a tick: its counters, shared across the tick's guards. */
export interface NavAllowance {
  work: SearchOptions['work'];
  searches: { left: number };
}

/** A mind's awareness: the state, the tick he entered it, his focus, if any, and why (perception/senses.ts). */
export interface MindAwareness {
  state: AwarenessState;
  since: number;
  focus: boolean;
  fx: number;
  fy: number;
  fz: number;
  /** The last stimulus that raised him: the event behind it, and why. */
  cause: number;
  reason: AlertReason;
}

