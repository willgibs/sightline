import type { BodyState } from '../body';
import type { BrainState } from '../brain';
import type { Senses } from '../perception';
import type { EntityBase, EntityId, EntityIndex } from '../kernel/state';
import type { GuardState } from './guards';
import type { PlayerControl } from './player';

/**
 * Sightline's kinds of entity: the player and the camp's guards, each with a body the
 * shared motor moves (the body lane). They join the kernel's registry of kinds
 * (kernel/state.ts) here, so the kernel's state tree carries them without naming them.
 */

/** The player is always the first entity spawned (setup.ts). */
export const PLAYER_ID: EntityId = 1;

export interface PlayerEntity extends EntityBase {
  kind: 'player';
  /** The physical body, moved by the shared motor. */
  body: BodyState;
  /** What the controls remember between ticks. */
  control: PlayerControl;
}

export interface GuardEntity extends EntityBase {
  kind: 'guard';
  /** The physical body, moved by the shared motor. */
  body: BodyState;
  guard: GuardState;
  /**
   * What he sees, hears and believes (the perception lane), where perception runs: the
   * perception lab and its scenarios until it joins the valley (A13). Without it he
   * neither sees nor hears, and keeps to his routine.
   */
  senses?: Senses;
  /** His brain's memory (lab E), where the camp brain runs; without it he keeps to routine, or lab A's minimal reactions. */
  brain?: BrainState;
}

declare module '../kernel/state' {
  interface EntityKinds {
    player: PlayerEntity;
    guard: GuardEntity;
  }
}

/** The run's player: always there, always entity 1. */
export function player(index: EntityIndex): PlayerEntity {
  const p = index.of('player')[0];
  if (!p || p.id !== PLAYER_ID) throw new Error('This run has no player');
  return p;
}
