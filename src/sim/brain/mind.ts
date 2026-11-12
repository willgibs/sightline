import type { Tuning } from '../../config/tuning';
import type { GuardSpawn } from '../generation';
import type { World } from '../kernel/world/world';
import type { BodyState } from '../body';
import type { AwarenessState, Belief, Percept } from '../perception';
import type { AlertReason } from '../kernel/events';
import type { SearchOptions } from '../kernel/world/search';
import type { BrainState } from './brain';
import type { CampAnswer } from './camp';

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

/**
 * What a mind may know of the world: its camp's own ground. The terrain, what's solid, the
 * grid a body walks, the camp's layout and posts, and its range card: where the firing
 * points that overlook it are, which a prepared defender knows. Not where anyone came into
 * the valley, not the mission it was built for, and nothing else the generator worked out
 * about how the camp can be taken (its certified ways in, who it found unwatched). A world
 * is one of these, so a mind is handed the world itself and can read only this much of it:
 * the brain lane names no wider type (tests/architecture.test.ts).
 */
export type Ground = Pick<World, 'terrain' | 'colliders' | 'grid' | 'camp' | 'playHalf' | 'crowns' | 'crownStop'> & {
  readonly report: { readonly camp?: { readonly perches: ReadonlyArray<Readonly<{ x: number; z: number }>> } };
};

export interface GuardMind {
  /** Who he is. */
  readonly id: EntityId;
  /** His own body, as he feels it. */
  readonly self: Readonly<Pick<BodyState, 'x' | 'y' | 'z' | 'yaw' | 'pitch' | 'stance' | 'speed' | 'motor'>>;
  /** His post: where he spawned, his route and his routine (from the camp, static). */
  readonly post: GuardSpawn;
  /** The static world, as much of it as a mind may know: its camp's own ground. */
  readonly world: Ground;
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
  /** Whether his camp fights back (Lab F): a fact about the camp, like its alarm boxes. */
  readonly fights: boolean;
  /** Whether its men are drilled for a fight at close quarters (firefight.ts): another fact about the camp. */
  readonly firefight: boolean;
  /** Whether it sends a section out after someone it has placed (hunt.ts): then nobody goes off the camp's own ground alone to look for him. */
  readonly hunts: boolean;
  /** Whether its men go after someone they watched leave its walls (firefight.ts, the chase). */
  readonly chases: boolean;
  /** Where his camp's hard room is, if it protects its target (protect.ts): another fact about the camp, and null if it doesn't. */
  readonly protects: Readonly<{ x: number; z: number; y?: number }> | null;
  /** How his camp answers for its target (protect.ts): its drill, which every man of it knows. Null for a camp that waits for its relief, or protects nobody. */
  readonly answer: CampAnswer | null;
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
  /** The work counter's nodes when the tick began, so a tick's route-finding can be capped by what it has actually expanded. */
  nodesAtStart: number;
  /** And its rays, for the looks for dead ground (ground.ts), which cost rays where a route costs cells. */
  raysAtStart: number;
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

