import type { GenTuning } from '../../config/tuning';
import { DEG, TWO_PI, datan2, dsin } from '../core/detmath';
import { turnTowards, wrapAngle, yawFromDirection } from '../core/math';
import type { Rng } from '../core/rng';
import type { GuardSpawn } from './camp';

/**
 * A guard's routine: one cycle of walks and holds, repeated for the whole mission, and a
 * pure function of mission time. Where every guard on routine is at any moment follows
 * from the routine alone: a guard who stops (killed, or pulled away by his brain)
 * changes nobody else's timetable, the player can learn the camp's rhythm, lab D can
 * validate the timing windows its patrols open and close, and the debug view can draw
 * where everyone will be in ten seconds.
 *
 * Routines are generated with the camp (their waits are drawn then, from the camp's own
 * stream), so a seed always gives the same rhythm. The simulation turns a routine into
 * movement intent each tick, and the shared motor gets the body there, with collision.
 */

export interface HoldLeg {
  kind: 'hold';
  /** Start and end, in seconds into the cycle. */
  t0: number;
  t1: number;
  x: number;
  z: number;
  /** Facing on arrival; turns at the routine's rate to `yawTo`, then holds. */
  yawFrom: number;
  yawTo: number;
}

export interface WalkLeg {
  kind: 'walk';
  t0: number;
  t1: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  yaw: number;
}

export type Leg = HoldLeg | WalkLeg;

export interface Routine {
  /** Seconds in one cycle. */
  period: number;
  /** Contiguous, covering [0, period). */
  legs: Leg[];
  /** Turning speed in holds, rad/s. */
  turnRate: number;
  /** Head sweep: amplitude in radians (smaller while walking), period in seconds, phase in cycles. */
  scanAmp: number;
  scanPeriod: number;
  scanPhase: number;
}

export interface RoutinePose {
  x: number;
  z: number;
  yaw: number;
  /** Head turn relative to the body. */
  headYaw: number;
  /** Walking at this moment. */
  moving: boolean;
  /** The routine's velocity at this moment, m/s. */
  vx: number;
  vz: number;
}

/**
 * The routine for a guard spawn. A sentry or worker holds his post; a patrol walks his
 * route from waypoint `routeStart − 1` (where he spawns), pausing at each waypoint for a
 * wait drawn from `rng`, turning toward the next leg as he pauses.
 */
export function buildRoutine(spawn: GuardSpawn, R: GenTuning['routines'], rng: Rng): Routine {
  const scan = {
    turnRate: R.turnRate,
    scanAmp: R.headScanDeg * DEG * spawn.scanScale,
    scanPeriod: R.headScanPeriod,
    scanPhase: spawn.scanPhase,
  };
  const route = spawn.route;
  if (!route || route.length < 2) {
    const yaw = yawFromDirection(spawn.faceX, spawn.faceZ);
    const period = R.headScanPeriod;
    return { period, legs: [{ kind: 'hold', t0: 0, t1: period, x: spawn.x, z: spawn.z, yawFrom: yaw, yawTo: yaw }], ...scan };
  }
  const n = route.length;
  const legs: Leg[] = [];
  let t = 0;
  for (let k = 0; k < n; k++) {
    const a = route[(spawn.routeStart - 1 + k + n) % n]!;
    const b = route[(spawn.routeStart + k) % n]!;
    const c = route[(spawn.routeStart + 1 + k) % n]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.sqrt(dx * dx + dz * dz);
    const walkYaw = datan2(-dx, -dz);
    const walk = length / R.pace;
    legs.push({ kind: 'walk', t0: t, t1: t + walk, x0: a.x, z0: a.z, x1: b.x, z1: b.z, yaw: walkYaw });
    t += walk;
    const nextYaw = datan2(-(c.x - b.x), -(c.z - b.z));
    // A pause is never shorter than the turn it contains.
    const turn = Math.abs(wrapAngle(nextYaw - walkYaw)) / R.turnRate;
    const hold = Math.max(turn, rng.between(R.holdTime));
    legs.push({ kind: 'hold', t0: t, t1: t + hold, x: b.x, z: b.z, yawFrom: walkYaw, yawTo: nextYaw });
    t += hold;
  }
  return { period: t, legs, ...scan };
}

/** Where a routine puts its guard at mission time `t` (seconds, from 0). Pure: the same t, the same pose. */
export function routinePose(r: Routine, t: number, out: RoutinePose): RoutinePose {
  const cycles = Math.floor(t / r.period);
  const tc = t - cycles * r.period;
  // Few legs: a linear scan is cheaper than a search and keeps this obviously right.
  let leg = r.legs[r.legs.length - 1]!;
  for (const l of r.legs) {
    if (tc < l.t1) {
      leg = l;
      break;
    }
  }
  if (leg.kind === 'walk') {
    const span = leg.t1 - leg.t0;
    const f = span > 0 ? Math.min(1, Math.max(0, (tc - leg.t0) / span)) : 1;
    out.x = leg.x0 + (leg.x1 - leg.x0) * f;
    out.z = leg.z0 + (leg.z1 - leg.z0) * f;
    out.yaw = leg.yaw;
    out.moving = true;
    out.vx = span > 0 ? (leg.x1 - leg.x0) / span : 0;
    out.vz = span > 0 ? (leg.z1 - leg.z0) / span : 0;
  } else {
    out.x = leg.x;
    out.z = leg.z;
    out.yaw = turnTowards(leg.yawFrom, leg.yawTo, r.turnRate * (tc - leg.t0));
    out.moving = false;
    out.vx = 0;
    out.vz = 0;
  }
  const amp = r.scanAmp * (out.moving ? 0.3 : 1);
  out.headYaw = amp * dsin(TWO_PI * (t / r.scanPeriod + r.scanPhase));
  return out;
}
