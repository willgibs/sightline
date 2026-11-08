import type { Tuning } from '../../config/tuning';
import { dcos } from '../kernel/core/detmath';
import type { BodySpec, BodyState } from './body';
import { footfall } from './footfall';

/**
 * Head bob: how far the eye dips below its resting height part way through a stride.
 * The eye is lowest as a foot comes down, the moment the motor emits the footstep, and
 * highest half a stride later; the dip deepens with speed through the gaits. Following
 * the body's own stride is what puts the camera's dip on the step you hear.
 *
 * Pure functions of the body's state, in exact arithmetic: the renderer evaluates them
 * between ticks, and the simulation can evaluate the same numbers if lab B decides that
 * a shot leaves from the bobbing eye.
 */

/** Depth of the dip at each gait's speed, metres (tuning.view.bob). */
export type BobDepths = Tuning['view']['bob'];

/** How far through its stride a body is: 0 as a foot comes down, rising toward 1 at the next. */
export function stridePhase(b: BodyState, spec: BodySpec, noise: Tuning['noise']): number {
  const p = b.stride / footfall(b.speed, spec, noise).stride;
  // NaN (no stride length) fails both tests and counts as a foot down.
  return p > 0 ? (p < 1 ? p : 1) : 0;
}

/** The eye's offset at a stride phase and speed, metres: 0 at rest, down to −depth. */
export function headBob(phase: number, speed: number, spec: BodySpec, depths: BobDepths): number {
  const d = bobDepth(speed, spec, depths);
  return d > 0 ? -d * 0.5 * (1 + dcos(2 * Math.PI * phase)) : 0;
}

/** The dip at a speed: from nothing at rest, through each gait's depth at that gait's speed. */
export function bobDepth(speed: number, spec: BodySpec, depths: BobDepths): number {
  if (!(speed > 0)) return 0;
  // The gaits bracketing this speed, whatever order their speeds come in.
  let loSpeed = 0;
  let loDepth = 0;
  let hiSpeed = Infinity;
  let hiDepth = 0;
  for (let k = 0; k < GAITS.length; k++) {
    const g = GAITS[k]!;
    const s = spec.speed[g];
    if (s <= speed && s >= loSpeed) {
      loSpeed = s;
      loDepth = depths[g];
    }
    if (s >= speed && s < hiSpeed) {
      hiSpeed = s;
      hiDepth = depths[g];
    }
  }
  // Faster than the fastest gait: its depth.
  if (hiSpeed === Infinity) return loDepth;
  return hiSpeed > loSpeed ? loDepth + ((hiDepth - loDepth) * (speed - loSpeed)) / (hiSpeed - loSpeed) : hiDepth;
}

const GAITS = ['crawl', 'crouch', 'walk', 'sprint'] as const;
