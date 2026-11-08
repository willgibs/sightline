/**
 * The perception lane: sight, hearing, percepts and the awareness ladder (lab A). It is
 * the only way anything about another entity reaches a mind (brain/mind.ts). Everything
 * outside the lane reaches it through this file.
 *
 * Its contract:
 * - **Exposure** for any observer (sight.ts): the zones, the caps, the rays to head, chest
 *   and feet, foliage and the sky behind, and the rate it fills a detection meter.
 * - **Light** at the ground beneath a body (light.ts), which the renderer's shade follows.
 * - **Foliage** (foliage.ts): volumes that dim sight the same in both directions.
 * - **Senses** (senses.ts): what a perceiving body carries in the state tree, its meter
 *   (meter.ts), its percepts and belief (percept.ts) and its awareness.
 *
 * The systems that run it for Sightline's guards are the game's (game/perception.ts).
 */
export type { Belief, Percept, PerceptKind } from './percept';
export { beliefRadius } from './percept';
export { AWARENESS, createSenses, rung, type Awareness, type AwarenessState, type PendingSound, type Senses, type SightState } from './senses';
export { exposure as tableExposure, movementVisibility, stanceVisibility } from './visibility';
export {
  ZONES,
  aimPoints,
  coneRamp,
  edgeWidth,
  emptyExposure,
  exposure,
  exposureRate,
  minClear,
  fillSeconds,
  rangeRamp,
  telegraphCap,
  type Exposure,
  type Observer,
  type SightRay,
  type SightTarget,
  type Zone,
} from './sight';
export { stepMeter, type MeterStep } from './meter';
export { groundLight, lightName } from './light';
export { Foliage, coneChord, cylinderChord, foliageOf, type FoliageVolume } from './foliage';
export { SIGHT_LAW, sweepSight, type RateLaw, type SweepReport } from './sweep';
export { SEED_LAW } from './seed';
