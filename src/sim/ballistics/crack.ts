import { airspeedAt, flightAt, vec3, type Flight, type Vec3 } from './trajectory';

/**
 * The crack (design doc · What a shot sounds like): a supersonic bullet drags a shock cone
 * behind it, and a listener hears the cone pass from wherever on the path it was
 * emitted, not from the rifle. The first sound to arrive comes from the point where the
 * line to the listener leaves the path at the Mach cone's angle: d·tan μ upstream of the
 * bullet's nearest pass for a listener d metres off a straight path, sin μ = c/v. At 300 m
 * that is about 60° off the shooter's true bearing for a guard 10 m from the path, which is
 * what misleads him (lab A, A5); a suppressor does nothing to it.
 *
 * Found from the path itself (trajectory.ts): the arrival time t + |L − P(t)|/c is least
 * at the emission point, searched with a fixed number of golden-section steps (rule 18).
 * The same function serves the guards' hearing and the player's speakers.
 */

export interface Crack {
  /** When it reaches the listener, mission seconds. */
  t: number;
  /** When the bullet was where it came from, and where that was. */
  emitted: number;
  x: number;
  y: number;
  z: number;
  /** Metres from there to the listener. */
  distance: number;
}

const p = vec3();

/**
 * The crack a listener hears from a bullet's flight, flown until mission time `until` (its
 * strike, or the longest it flies): written to `out`, or null when none reaches it: the
 * bullet was never supersonic where the cone would come from, the listener is behind the
 * muzzle, where the report arrives first and the cone never does, or beyond where the
 * flight ended, where the point that would send it was never reached.
 */
export function crackAt(f: Flight, until: number, listener: Vec3, speedOfSound: number, out: Crack): Crack | null {
  if (!(f.v0 > speedOfSound) || until <= f.t) return null;
  const arrival = (t: number): number => {
    flightAt(f, t, p);
    const dx = listener.x - p.x;
    const dy = listener.y - p.y;
    const dz = listener.z - p.z;
    return t + Math.sqrt(dx * dx + dy * dy + dz * dz) / speedOfSound;
  };
  const g = 0.6180339887498949;
  let a = f.t;
  let b = until;
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  let fc = arrival(c);
  let fd = arrival(d);
  for (let k = 0; k < 80; k++) {
    if (fc <= fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - g * (b - a);
      fc = arrival(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + g * (b - a);
      fd = arrival(d);
    }
  }
  const emitted = (a + b) / 2;
  // At the muzzle: the cone never reaches this listener ahead of the report.
  if (emitted - f.t < 1e-4) return null;
  // At the end of the flight: the bullet stopped short of where the cone would leave for this listener.
  if (until - emitted < 1e-4) return null;
  if (airspeedAt(f, emitted) <= speedOfSound) return null;
  out.t = arrival(emitted);
  out.emitted = emitted;
  flightAt(f, emitted, p);
  out.x = p.x;
  out.y = p.y;
  out.z = p.z;
  out.distance = (out.t - emitted) * speedOfSound;
  return out;
}
