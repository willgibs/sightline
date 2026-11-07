import type { Surface } from './world/surfaces';

/**
 * Things that happened during a tick. Phase 1 perception listens to footsteps as sound
 * stimuli; the debug view draws them; recordings keep them for the replay.
 */

/** Who made a sound: the player, or a guard by id. */
export const PLAYER_SOURCE = -1;

export interface FootstepEvent {
  type: 'footstep';
  tick: number;
  source: number;
  x: number;
  y: number;
  z: number;
  surface: Surface;
  /** Relative loudness: movement × surface. */
  loudness: number;
  /** How far an unmasked guard with normal hearing would hear it, in metres. */
  radius: number;
}

export interface StanceEvent {
  type: 'stance';
  tick: number;
  from: StanceName;
  to: StanceName;
}

export type StanceName = 'stand' | 'crouch' | 'prone';

export type SimEvent = FootstepEvent | StanceEvent;
