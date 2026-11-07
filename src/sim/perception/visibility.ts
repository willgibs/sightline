import type { Tuning } from '../../config/tuning';
import type { BodyState } from '../motor/body';

/**
 * How visible a body is, from the design doc's sight table (stance × movement × light).
 * Lab A's detection multiplies this with the cone, distance, cover and skyline.
 *
 * Both factors follow what the body is actually doing, not what was asked for: diving
 * prone in view of a guard only helps once you're down, and stopping only helps once
 * you've stopped.
 */

/** Stance × movement × daylight, with no cover. */
export function exposure(b: BodyState, tuning: Tuning): number {
  return stanceVisibility(b, tuning) * movementVisibility(b, tuning) * tuning.visibility.light.lit;
}

/** The stance factor for how tall the body is: interpolated by eye height between the table's rows. */
export function stanceVisibility(b: BodyState, tuning: Tuning): number {
  const E = tuning.player.eyeHeight;
  const S = tuning.visibility.stance;
  const e = b.eyeHeight;
  if (e >= E.stand) return S.stand;
  if (e >= E.crouch) return S.crouch + ((S.stand - S.crouch) * (e - E.crouch)) / (E.stand - E.crouch);
  if (e > E.prone) return S.prone + ((S.crouch - S.prone) * (e - E.prone)) / (E.crouch - E.prone);
  return S.prone;
}

/** The movement factor for how fast the body is actually moving. */
export function movementVisibility(b: BodyState, tuning: Tuning): number {
  const V = tuning.visibility;
  if (b.speed < 0.2) return V.movement.still;
  if (b.speed > tuning.player.speed.walk + 0.25) return V.movement.sprinting;
  return V.movement.moving;
}
