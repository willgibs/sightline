import type { Tuning } from '../../config/tuning';
import type { SightState } from './senses';

/**
 * The detection meter (design doc · Enemy perception · Sight): it fills while someone of
 * the other side is in view, at the rate exposure gives (sight.ts), holds a moment after
 * they leave, then falls. Below the cue nothing shows; at the cue the first sign does; at 1
 * he has seen you.
 */

/** What one step of the meter did. */
export interface MeterStep {
  /** It rose through the cue: the first sign shows now. */
  noticed: boolean;
  /** It reached 1: he has seen you. */
  detected: boolean;
  /** It fell back below the cue: the sign is gone. */
  lost: boolean;
}

const step: MeterStep = { noticed: false, detected: false, lost: false };

/**
 * Advances the meter by `dt` seconds at `rate` (0 when no one is in view). Returns what
 * happened, in a reused object.
 */
export function stepMeter(s: SightState, rate: number, dt: number, tick: number, tuning: Tuning): MeterStep {
  const S = tuning.perception.sight;
  const before = s.meter;
  if (rate > 0) {
    s.meter = before + rate * dt;
    if (s.meter > 1) s.meter = 1;
    s.seenTick = tick;
  } else if (s.seenTick < 0 || (tick - s.seenTick) / tuning.sim.tickHz > S.hold) {
    s.meter = before - S.decay * dt;
    if (s.meter < 0) s.meter = 0;
  }
  step.noticed = before < S.cue && s.meter >= S.cue;
  step.detected = before < 1 && s.meter >= 1;
  step.lost = before >= S.cue && s.meter < S.cue;
  return step;
}
