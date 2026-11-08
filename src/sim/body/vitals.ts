import type { Tuning } from '../../config/tuning';
import type { Gait } from './body';

/**
 * Vitals: a shooter's heart and breath, which steady or shake the aim (design doc ·
 * Vitals). Plain data in the state, stepped once a tick from what the body did and
 * whether the breath is held; every rate is per second, times dt (rule 17). Lab C extends
 * them: carrying a body, a fall, a close call.
 *
 * - The heart drives toward the rate the body's effort asks for (tuning.vitals.effortHr):
 *   quickly up, slowly down, so a sprint takes about 20 s to settle.
 * - A held breath steadies the aim for holdTime seconds, less the faster the heart beats,
 *   then runs out; letting it go after a hold brings a gasp. Breath comes back over
 *   recoverTime, and can't be held again until minAir of it is back.
 * - The breathing and the heartbeat keep their phases here, advanced at their own rates,
 *   so the sway built on them (ballistics lane) is a pure function of the state.
 */

export interface VitalsState {
  /** Beats a minute. */
  heartRate: number;
  /** Where in its beat the heart is, 0 to 1. */
  beat: number;
  /** Where in its breath the chest is, 0 to 1. */
  breath: number;
  /** A second, slower phase of the breathing, for the aim's sideways drift: 0 to 1. */
  drift: number;
  /** Seconds the breath has been held; 0 while breathing. */
  held: number;
  /** How much breath there is to hold, 0 to 1. */
  air: number;
  /** Seconds since the last hold was let go, and how long that hold was. */
  released: number;
  lastHold: number;
}

/** A calm shooter's vitals. */
export function calmVitals(V: Tuning['vitals']): VitalsState {
  return { heartRate: V.restingHr, beat: 0, breath: 0, drift: 0, held: 0, air: 1, released: 60, lastHold: 0 };
}

/** Seconds a breath steadies the aim at this heart rate: holdTime when calm, holdAtMaxHr at the top. */
export function holdLength(heartRate: number, V: Tuning['vitals']): number {
  const span = V.maxHr - V.restingHr;
  const f = span > 0 ? Math.min(1, Math.max(0, (heartRate - V.restingHr) / span)) : 0;
  return V.holdTime + (V.holdAtMaxHr - V.holdTime) * f;
}

/** True while a hold still steadies: held, and not yet run out. */
export function holding(v: VitalsState, V: Tuning['vitals']): boolean {
  return v.held > 0 && v.held <= holdLength(v.heartRate, V);
}

/** Breaths a second at a heart rate: faster as it climbs. */
export function breathRate(heartRate: number, base: number, V: Tuning['vitals']): number {
  return base * Math.max(0.5, heartRate / V.restingHr);
}

/**
 * One tick of vitals: the heart toward what `gait` asks, the breath held or let go
 * (`hold`, the player's held state), the phases on. `breathBase` is breaths a second at
 * rest (the sway's breathing rate).
 */
export function stepVitals(v: VitalsState, gait: Gait, hold: boolean, breathBase: number, V: Tuning['vitals'], dt: number): void {
  const want = V.effortHr[gait];
  const tau = want > v.heartRate ? V.rise : V.calm;
  // An exact exponential approach would need dexp per tick; dt/τ of the way each tick is
  // the same to within a fraction of a beat at 30 Hz, and stays put at any tick rate.
  v.heartRate += (want - v.heartRate) * Math.min(1, dt / tau);
  v.heartRate = Math.min(V.maxHr, Math.max(V.restingHr * 0.5, v.heartRate));

  if (hold && (v.held > 0 || v.air >= V.minAir)) {
    // Holding: the air drains over this heart rate's hold, and past it the hold is spent.
    v.held += dt;
    v.air = Math.max(0, v.air - dt / holdLength(v.heartRate, V));
  } else {
    if (v.held > 0) {
      v.lastHold = v.held;
      v.released = 0;
    }
    v.held = 0;
    v.released = Math.min(60, v.released + dt);
    v.air = Math.min(1, v.air + dt / V.recoverTime);
  }

  v.beat = wrap01(v.beat + (v.heartRate / 60) * dt);
  // The chest stills while the breath is held.
  const rate = v.held > 0 ? 0 : breathRate(v.heartRate, breathBase, V);
  v.breath = wrap01(v.breath + rate * dt);
  v.drift = wrap01(v.drift + rate * 0.618 * dt);
}

/**
 * A close call: a bullet cracking past, a near miss, a body found. The heart jumps by
 * `tuning.vitals.closeCall` beats (more for a bigger fright, by `scale`), then settles as
 * after a sprint. Lab E calls it when guards shoot back (E10); lab C for falls and finds.
 */
export function startle(v: VitalsState, V: Tuning['vitals'], scale = 1): void {
  v.heartRate = Math.min(V.maxHr, v.heartRate + V.closeCall * scale);
}

function wrap01(x: number): number {
  return x - Math.floor(x);
}
