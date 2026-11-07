/**
 * How sound behaves, in one place, for everything that hears it: the guards (Phase 1
 * perception) and the player's own speakers. One law for both is what keeps hearing
 * honest: if you can hear a sound, a guard standing where you are could hear it too.
 *
 * A sound's radius is how far away an unmasked listener with normal hearing would just
 * hear it. Level follows the inverse-distance law (6 dB quieter per doubling), so a sound
 * is exactly at the threshold of hearing at its radius, and twice as loud at half of it.
 */

/** Level relative to the threshold of hearing: 1 at the radius, 2 at half of it. */
export function audibility(radius: number, distance: number): number {
  return radius / Math.max(distance, 1);
}

/** Seconds a sound takes to travel `distance` metres. */
export function travelTime(distance: number, speedOfSound: number): number {
  return distance / speedOfSound;
}
