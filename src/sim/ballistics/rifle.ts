import type { Tuning } from '../../config/tuning';
import type { Ballistic, Zero } from './aim';
import { zeroFor } from './aim';
import { dragIn } from './trajectory';

/**
 * The rifle a shooter carries: plain data in the state (rule 9), its numbers from
 * tuning.ballistics.rifle (rule 16). The game gives one to whoever carries it (a run's
 * setup); the shooting systems fire it, cycle its bolt, raise its scope, find it a rest
 * and sample its sway.
 */

/** Where the aim had wandered from the line of sight, at the end of a tick (sway.ts). */
export interface SwaySample {
  /** Mils up and right, in the scope's frame. */
  up: number;
  right: number;
  /** How far the scope was up, 0 to 1: the camera shows `raise` of the sway. */
  raise: number;
}

export interface RifleState {
  /** Rounds left, the chambered one included. */
  rounds: number;
  /** Seconds until the bolt has chambered the next round; 0 when one is ready. */
  bolt: number;
  /** The zero dialled, metres. */
  zero: number;
  /** The load in the magazine (a key of tuning.ballistics.loads). */
  load: string;
  suppressed: boolean;
  /** Seconds left fitting or taking off the suppressor; no shooting until it's done. */
  fitting: number;
  /** How far the scope is up, 0 to 1. */
  raise: number;
  /** How settled on a rest the rifle is, 0 to 1. */
  rest: number;
  /** How settled after moving, 0 (moving) to 1 (still for `settle` seconds). */
  steady: number;
  /** Mission time of the last shot, for its recoil; −1 before any. */
  lastShot: number;
  /** The sway at the end of this tick, and at the end of the two before, newest first. */
  sway: SwaySample;
  history: [SwaySample, SwaySample];
  /** Throwables carried (B9). */
  throwables: number;
}

/** A rifle as a run starts with it: loaded, zeroed at the dial's start, scope down. */
export function freshRifle(B: Tuning['ballistics']): RifleState {
  const still = (): SwaySample => ({ up: 0, right: 0, raise: 0 });
  return {
    rounds: B.rifle.rounds,
    bolt: 0,
    zero: B.rifle.zero.start,
    load: B.rifle.load,
    suppressed: B.rifle.suppressed,
    fitting: 0,
    raise: 0,
    rest: 0,
    steady: 1,
    lastShot: -1,
    sway: still(),
    history: [still(), still()],
    throwables: B.throwable.count,
  };
}

/** The load a rifle has, from the tuning; the rifle's own if it names one, else the tuning's start. */
export function loadOf(rifle: Pick<RifleState, 'load'>, B: Tuning['ballistics']): Tuning['ballistics']['loads']['match'] {
  const loads = B.loads as Readonly<Record<string, Tuning['ballistics']['loads']['match']>>;
  return loads[rifle.load] ?? loads[B.rifle.load] ?? B.loads.match;
}

/** The ballistic numbers of a rifle's shot in the mission's air and wind. */
export function ballisticOf(rifle: Pick<RifleState, 'load'>, tuning: Tuning, density: number, wind: { x: number; z: number }): Ballistic {
  const load = loadOf(rifle, tuning.ballistics);
  return { v0: load.muzzleSpeed, k: dragIn(load, density, tuning.ballistics), g: tuning.sim.gravity, wx: wind.x, wz: wind.z };
}

/** The zero a rifle has dialled, for its load in the mission's air. */
export function zeroOf(rifle: Pick<RifleState, 'load' | 'zero'>, tuning: Tuning, density: number): Zero {
  const load = loadOf(rifle, tuning.ballistics);
  return zeroFor(rifle.zero, { v0: load.muzzleSpeed, k: dragIn(load, density, tuning.ballistics), g: tuning.sim.gravity }, tuning.ballistics.maxFlight);
}

/** The dial one click up or down, within its range. */
export function dialZero(rifle: RifleState, clicks: number, B: Tuning['ballistics']): void {
  const Z = B.rifle.zero;
  rifle.zero = Math.min(Z.max, Math.max(Z.min, rifle.zero + clicks * Z.step));
}

/** Moves the sway history on: the sample this tick ends with becomes the newest. Call before writing the new one. */
export function pushSway(r: RifleState): void {
  const [h0, h1] = r.history;
  h1.up = h0.up;
  h1.right = h0.right;
  h1.raise = h0.raise;
  h0.up = r.sway.up;
  h0.right = r.sway.right;
  h0.raise = r.sway.raise;
}

/**
 * The sway `lag` ticks before now (0 to 2), between its samples, exactly as the
 * renderer interpolates between its last two snapshots: what the camera showed at that
 * instant, and where the shot goes. Before the aim system runs in a tick, "now" is the
 * end of the previous tick (as for a body's pose, body/body.ts poseAt).
 */
export function swayAt(r: RifleState, lag: number, out: SwaySample): SwaySample {
  const [h0, h1] = r.history;
  const l = lag < 0 ? 0 : lag > 2 ? 2 : lag;
  const newer = l <= 1 ? r.sway : h0;
  const older = l <= 1 ? h0 : h1;
  const t = l <= 1 ? l : l - 1;
  out.up = newer.up + (older.up - newer.up) * t;
  out.right = newer.right + (older.right - newer.right) * t;
  out.raise = newer.raise + (older.raise - newer.raise) * t;
  return out;
}
