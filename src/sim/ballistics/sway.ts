import type { Tuning } from '../../config/tuning';
import { holdLength, type BodyState, type VitalsState } from '../body';
import { TWO_PI, dsin } from '../kernel/core/detmath';
import type { RifleState, SwaySample } from './rifle';

/**
 * Sway: how far the aim has wandered from the line of sight, in mils, as a pure function
 * of the state and the time (rule 14). The aim system samples it at every tick's end and
 * keeps two ticks of history (rifle.ts), and the camera and the shot both read it
 * through one interpolation, so the shot goes where the drawn reticle pointed.
 *
 * Its parts, each learnable:
 *   breathing   up and down with the chest, and a slower sideways drift (a second phase at
 *               0.618 of the breathing rate, so the figure never repeats); it stills
 *               while the breath is held, and comes back with a gasp after a long hold;
 *   tremor      the grip: smooth value noise on both axes, hashed from the time, so it is
 *               the same on every replay and in every engine;
 *   heartbeat   a kick at the start of each beat, mostly up, harder as the heart races;
 *   recoil      the shot's kick, settling over recoilTime.
 * Stance, a rest, moving and the heart rate scale them all. tuning.ballistics.sway has
 * the numbers; the bench measures the ladder they make (game/benches.ts).
 */

/** Where the sway is at mission time `t`, for a shooter in this state; written to `out` (raise left as it is). */
export function swaySample(
  rifle: RifleState,
  vitals: VitalsState,
  body: Pick<BodyState, 'stance' | 'eyeHeight'>,
  t: number,
  seed: number,
  tuning: Tuning,
  out: SwaySample,
): SwaySample {
  const S = tuning.ballistics.sway;
  const V = tuning.vitals;
  // How the body holds the rifle: by stance (following the eye between stances), on a rest, moving.
  const stance = stanceFactor(body.eyeHeight, tuning, S.stance);
  const rest = 1 + (S.rested - 1) * rifle.rest;
  const moving = 1 + (S.moving - 1) * (1 - rifle.steady);
  const heart = 1 + S.heart * Math.max(0, vitals.heartRate - V.restingHr);
  const scale = stance * rest * moving * heart;

  // A held breath stills the chest and the grip, easing in over its first half second;
  // once it has run out, both come back and the tremor grows.
  const hold = holdLength(vitals.heartRate, V);
  let still = 1;
  let shake = 1;
  if (vitals.held > 0) {
    const settling = Math.min(1, vitals.held / Math.max(S.holdSettle, 1e-6));
    if (vitals.held <= hold) still = 1 + (S.held - 1) * settling * settling * (3 - 2 * settling);
    else shake = 1 + Math.min(S.spentMax, (vitals.held - hold) * S.spent);
  }
  // Letting go after a long hold: a gasp, fading over gaspTime.
  const gaspLeft = 1 - vitals.released / S.gaspTime;
  const gasp = gaspLeft > 0 ? 1 + (S.gasp - 1) * Math.min(1, vitals.lastHold / Math.max(hold, 1e-6)) * gaspLeft * gaspLeft : 1;

  const breathe = S.breath * still * gasp;
  let up = breathe * dsin(TWO_PI * vitals.breath);
  let right = breathe * S.drift * dsin(TWO_PI * vitals.drift + 1.3);

  const tremor = S.tremor * (vitals.held > 0 && vitals.held <= hold ? still : shake);
  up += tremor * smoothNoise(t * S.tremorRate, seed);
  right += tremor * smoothNoise(t * S.tremorRate, seed + 7919);

  // The heartbeat: a short bump at the start of each beat.
  const b = vitals.beat;
  const bump = b < S.pulseWidth ? squaredSine(b / S.pulseWidth) : 0;
  up += S.pulse * bump * Math.max(1, vitals.heartRate / V.restingHr);
  right += S.pulse * S.pulseRight * bump;

  out.up = up * scale;
  out.right = right * scale;

  // The shot's kick: up and a little right, easing back down; prone on a rest tames it.
  if (rifle.lastShot >= 0) {
    const since = t - rifle.lastShot;
    if (since >= 0 && since < S.recoilTime) {
      const k = 1 - since / S.recoilTime;
      const kick = S.recoil * k * k * Math.max(stance * rest, S.recoilFloor);
      out.up += kick;
      out.right += S.recoilRight * kick;
    }
  }
  return out;
}

/** Stance's multiplier, following the eye between stances as the body's shape does. */
function stanceFactor(eye: number, tuning: Tuning, F: Tuning['ballistics']['sway']['stance']): number {
  const E = tuning.bodies.player.eyeHeight;
  if (eye >= E.crouch) {
    const t = E.stand > E.crouch ? Math.min(1, (eye - E.crouch) / (E.stand - E.crouch)) : 1;
    return F.crouch + (F.stand - F.crouch) * t;
  }
  const t = E.crouch > E.prone ? Math.max(0, (eye - E.prone) / (E.crouch - E.prone)) : 0;
  return F.prone + (F.crouch - F.prone) * t;
}

/** sin²(π·x/2) on [0, 1] rising and falling back: a smooth bump from 0 through 1 to 0. */
function squaredSine(x: number): number {
  const s = dsin(Math.PI * x);
  return s * s;
}

/**
 * Smooth value noise in [−1, 1]: a hashed value at every whole number, eased between
 * (smoothstep), so it is continuous and its slope is too. Integer hashing only: the same
 * bits in every engine.
 */
export function smoothNoise(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hashUnit(i, seed);
  const b = hashUnit(i + 1, seed);
  const e = f * f * (3 - 2 * f);
  return a + (b - a) * e;
}

/** A hash of an integer and a seed to [−1, 1]. */
function hashUnit(i: number, seed: number): number {
  let h = (Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(seed | 0, 0x165667b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca77);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae3d);
  h ^= h >>> 16;
  return (h >>> 0) / 2147483647.5 - 1;
}
