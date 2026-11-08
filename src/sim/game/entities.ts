import type { BodyState, VitalsState } from '../body';
import type { RifleState } from '../ballistics';
import type { Senses } from '../perception';
import type { EntityBase, EntityId, EntityIndex } from '../kernel/state';
import type { BodyPart } from '../kernel/world/shape';
import type { GuardState } from './guards';
import type { PlayerControl } from './player';

/**
 * Sightline's kinds of entity: the player and the camp's guards, each with a body the
 * shared motor moves (the body lane), and the body a killed guard leaves. They join the
 * kernel's registry of kinds (kernel/state.ts) here, so the kernel's state tree carries
 * them without naming them. (Bullets are the ballistics lane's own kind.)
 */

/** The player is always the first entity spawned (setup.ts). */
export const PLAYER_ID: EntityId = 1;

export interface PlayerEntity extends EntityBase {
  kind: 'player';
  /** The physical body, moved by the shared motor. */
  body: BodyState;
  /** What the controls remember between ticks. */
  control: PlayerControl;
  /**
   * The rifle and the vitals that steady it, when the run gives them (a scene's setup now,
   * the mission's loadout in Phase 2). Without a rifle a click is a bare shot.
   */
  rifle?: RifleState;
  vitals?: VitalsState;
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
}

/**
 * The body a killed guard leaves (lab B, B4): where he fell, which way, and when, so his
 * shape at any instant follows (game/remains.ts): standing as he was hit, collapsing to
 * the ground over tuning.ballistics.hits.collapseTime. Sight lines and bullets see it;
 * perception finds it (lab A); lab C's use action carries it.
 */
export interface RemainsEntity extends EntityBase {
  kind: 'remains';
  remains: {
    /** The guard who fell (his entity id, gone now) and his camp post (world.camp.guards). */
    of: EntityId;
    post: number;
    /** His feet when he was hit. */
    x: number;
    y: number;
    z: number;
    /** Which way he falls: the bullet's way across the ground. */
    yaw: number;
    /** His eye height when he was hit. */
    eye: number;
    /** When he was hit, mission seconds. */
    fell: number;
    part: BodyPart;
  };
}

declare module '../kernel/state' {
  interface EntityKinds {
    player: PlayerEntity;
    guard: GuardEntity;
    remains: RemainsEntity;
  }
}

/** The run's player: always there, always entity 1. */
export function player(index: EntityIndex): PlayerEntity {
  const p = index.of('player')[0];
  if (!p || p.id !== PLAYER_ID) throw new Error('This run has no player');
  return p;
}
