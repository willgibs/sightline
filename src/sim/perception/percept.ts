/**
 * Percepts: what perception hands a mind (brain/mind.ts), the only way anything about
 * another entity reaches a brain. A percept is a record of one thing sensed: what kind of
 * stimulus, how strong, where it seemed to be and how unsure that is, when it was sensed
 * and when it lapses, and the event that caused it, for the debrief's chain of causes.
 *
 * A percept never says who made a stimulus: a guard hears a footstep at a place, not the
 * player. Its place is where it seemed to be, with perception's errors already in it.
 */

/**
 * The kinds of stimulus:
 *   sight   a body of the other side, in view (strength: the detection meter)
 *   sound   a footstep, a landing, a dropped noise (strength: its clarity)
 *   shot    a report, a crack or an impact (lab B's sounds, B8)
 *   voice   someone's bark or shout (lab E spreads beliefs this way, E4)
 * Labs B, D and E add body, impact, object, glint and door as their sources land (A9).
 */
export type PerceptKind = 'sight' | 'sound' | 'shot' | 'voice' | 'body' | 'impact' | 'object' | 'glint' | 'door';

export interface Percept {
  kind: PerceptKind;
  /** Where it seemed to be. */
  x: number;
  y: number;
  z: number;
  /** How unsure that is: the true place is probably within this many metres. */
  radius: number;
  /** How strong: sight, the meter (0–1); a sound, its clarity (1 at the edge of hearing). */
  strength: number;
  /** The tick it was sensed: its age is the tick being decided minus this. */
  tick: number;
  /** The tick it lapses: a mind sees it until then. */
  expires: number;
  /** The event behind it (the footstep, the detection), or 0. */
  cause: number;
}

/**
 * Where a guard believes the intruder is (design doc · Beliefs, not truth): the last known
 * position, with its uncertainty. It comes only from percepts, so it is wrong in exactly
 * the ways his senses were.
 */
export interface Belief {
  x: number;
  y: number;
  z: number;
  /** How unsure, in metres, when it was formed; it grows as the belief ages (beliefRadius). */
  radius: number;
  /** When it was formed. */
  tick: number;
  /** Confirmed by sight: he saw someone, all the way to 100%. */
  seen: boolean;
  /** The event that formed it. */
  cause: number;
}

/** How unsure a belief is at `tick`: its radius then, grown by how far an intruder could have moved since. */
export function beliefRadius(b: Belief, tick: number, tickHz: number, speed: number): number {
  const age = Math.max(0, tick - b.tick) / tickHz;
  return b.radius + speed * age;
}
