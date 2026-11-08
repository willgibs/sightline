/**
 * Percepts: what perception hands a mind (brain/mind.ts), the only way anything about
 * another entity reaches a brain.
 */

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
