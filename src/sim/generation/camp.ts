import type { Routine } from './routine';
import type { Point2 } from './paths';
import type { Site } from './site';

/**
 * What a camp is: its structures, and the posts of the guards who staff it. The compound
 * generator builds one (compound.ts, staffing.ts), a handmade scene another (handmade.ts).
 */

export type StructureKind =
  | 'fence'
  | 'post'
  | 'tower'
  | 'building'
  | 'container'
  | 'sandbags'
  | 'crate'
  | 'generator'
  | 'pole'
  | 'mast'
  | 'vehicle'
  /** A pole flying a flag that streams with the mission's wind: a cue to read it by (design doc · Wind). */
  | 'flag'
  /** A piece of hand-built geometry (handmade.ts): stairs, a ceiling, a wall in a scene. */
  | 'block'
  /** Generated camps (compound.ts): a tower's ladder, the generator's shed, a light pole, an alarm box. */
  | 'ladder'
  | 'shed'
  | 'light'
  | 'alarm'
  /** The radio set inside the radio room; its antenna is the mast. */
  | 'radio';

export interface Structure {
  kind: StructureKind;
  colliders: number[];
}

/**
 * The jobs a guard can have (design doc, Roles). Each is something the player can remove
 * from the camp, with its own consequence: a sentry's sector, a patrol's partner, a
 * marksman's long-range eyes, a radio operator's check-ins, an officer's searches, a
 * worker's chores, the target the mission is for.
 */
export const GUARD_ROLES = ['sentry', 'patrol', 'marksman', 'radio-operator', 'officer', 'worker', 'target'] as const;

export type GuardRole = (typeof GUARD_ROLES)[number];

export interface GuardSpawn {
  id: number;
  role: GuardRole;
  x: number;
  y: number;
  z: number;
  /** Initial facing as a unit vector. */
  faceX: number;
  faceZ: number;
  /** Raised posts (towers) keep a fixed height instead of following the ground. */
  elevated: boolean;
  route: Point2[] | null;
  routeStart: number;
  /** Phase offset for head scanning, so sentries don't sweep in lockstep. */
  scanPhase: number;
  scanScale: number;
  /** What he does all mission, as a pure function of time (routine.ts). */
  routine: Routine;
}

export interface Camp {
  /** Where it stands: its centre, its gate's direction, its pad. */
  site: Site;
  structures: Structure[];
  guards: GuardSpawn[];
  /** Fence half-size. */
  fenceHalf: number;
}
