import type { Tuning } from '../../config/tuning';
import type { BodySpec, BodyState } from '../body';

/**
 * How visible a body is, from the design doc's sight table (stance × movement × light).
 * Lab A's detection multiplies this with the cone, distance, cover and skyline.
 *
 * Both factors follow what the body is actually doing, not what was asked for: diving
 * prone in view of a guard only helps once you're down, and stopping only helps once
 * you've stopped.
 */

/** Stance × movement × light (env.ts, lightAt; full sun by default), with no cover. */
export function exposure(b: BodyState, spec: BodySpec, tuning: Tuning, light = tuning.visibility.light.lit): number {
  return stanceVisibility(b, spec, tuning) * movementVisibility(b, spec, tuning) * light;
}

/** The stance factor for how tall the body is: interpolated by its eye height between the table's rows. */
export function stanceVisibility(b: BodyState, spec: BodySpec, tuning: Tuning): number {
  const E = spec.eyeHeight;
  const S = tuning.visibility.stance;
  const e = b.eyeHeight;
  if (e >= E.stand) return S.stand;
  if (e >= E.crouch) return S.crouch + ((S.stand - S.crouch) * (e - E.crouch)) / (E.stand - E.crouch);
  if (e > E.prone) return S.prone + ((S.crouch - S.prone) * (e - E.prone)) / (E.crouch - E.prone);
  return S.prone;
}

/**
 * The movement factor for how fast the body is actually moving. It ramps, so no speed is a
 * cliff: from still at rest to moving at `movingAt` m/s, then from moving at the body's
 * walk to sprinting at its sprint.
 */
export function movementVisibility(b: BodyState, spec: BodySpec, tuning: Tuning): number {
  const V = tuning.visibility.movement;
  const v = b.speed;
  const at = tuning.perception.sight.movingAt;
  if (v < at) return V.still + ((V.moving - V.still) * (v > 0 ? v : 0)) / at;
  if (v <= spec.speed.walk) return V.moving;
  if (v >= spec.speed.sprint) return V.sprinting;
  return V.moving + ((V.sprinting - V.moving) * (v - spec.speed.walk)) / (spec.speed.sprint - spec.speed.walk);
}
