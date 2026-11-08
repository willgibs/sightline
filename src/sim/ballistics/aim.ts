import { dcos, dsin } from '../kernel/core/detmath';
import { flightAt, timeAtRange, vec3, type Flight, type Vec3 } from './trajectory';

/**
 * Aiming with the one ballistic function (trajectory.ts): the bore's line from the line
 * of sight and the dialled zero, the launch of a shot, where a shot lands at a range,
 * and the hold that puts it on a point. The rifle fires with these, and every instrument
 * reads them: the zero dial, the reticle's holds, the rangefinder's card, the assists
 * and the bench's sweep, so what any of them shows is what the bullet does.
 *
 * Holds are in mils, as the reticle draws them: a thousandth of the distance across the
 * line of sight, in the scope's own frame (up across the line of sight in its vertical
 * plane; right level and square to it). A hold of 1.5 up means the target sits on the
 * mark 1.5 mil below the reticle's centre: the line of sight is 1.5 mil above it.
 */

/** A hold in mils: how far the line of sight is above and to the right of the target. */
export interface Hold {
  up: number;
  right: number;
}

/** The scope's frame for a line of sight: unit up (across it, in its vertical plane) and right (level). */
export interface SightFrame {
  ux: number;
  uy: number;
  uz: number;
  rx: number;
  rz: number;
}

/** The scope's up and right for a unit line of sight, written to `out`. Looking straight up or down, "up" is north. */
export function sightFrame(lx: number, ly: number, lz: number, out: SightFrame): SightFrame {
  const cos = Math.sqrt(lx * lx + lz * lz);
  if (cos > 1e-9) {
    out.ux = (-lx * ly) / cos;
    out.uy = cos;
    out.uz = (-lz * ly) / cos;
    // right = forward × up, level: (−lz, 0, lx)/cos.
    out.rx = -lz / cos;
    out.rz = lx / cos;
  } else {
    out.ux = 0;
    out.uy = 0;
    out.uz = -1;
    out.rx = 1;
    out.rz = 0;
  }
  return out;
}

const sf: SightFrame = { ux: 0, uy: 1, uz: 0, rx: 1, rz: 0 };

/** The bore's line: a unit line of sight turned up in its vertical plane by an angle with cosine `cosE` and sine `sinE` (the zero). */
export function boreLine(lx: number, ly: number, lz: number, cosE: number, sinE: number, out: Vec3): Vec3 {
  sightFrame(lx, ly, lz, sf);
  out.x = lx * cosE + sf.ux * sinE;
  out.y = ly * cosE + sf.uy * sinE;
  out.z = lz * cosE + sf.uz * sinE;
  return out;
}

/** What a shot needs besides its line: the load in the mission's air, gravity and the wind. */
export interface Ballistic {
  /** Muzzle speed, m/s. */
  v0: number;
  /** Drag constant in the mission's air, per metre. */
  k: number;
  g: number;
  /** The wind's velocity, m/s. */
  wx: number;
  wz: number;
}

/**
 * The launch of a shot from `eye` along the unit line of sight `los`, with the bore turned
 * up by the zero's elevation (its cosine and sine), at mission time `t`. Writes `out`.
 */
export function launch(out: Flight, eye: Vec3, los: Vec3, zero: Zero, b: Ballistic, t: number): Flight {
  const bore = boreLine(los.x, los.y, los.z, zero.cos, zero.sin, scratchBore);
  out.x = eye.x;
  out.y = eye.y;
  out.z = eye.z;
  out.dx = bore.x;
  out.dy = bore.y;
  out.dz = bore.z;
  out.t = t;
  out.v0 = b.v0;
  out.k = b.k;
  out.g = b.g;
  out.wx = b.wx;
  out.wz = b.wz;
  return out;
}

const scratchBore = vec3();

/** A zero: the bore's elevation above the line of sight, with its cosine and sine. */
export interface Zero {
  /** The range it was set for, metres. */
  range: number;
  elevation: number;
  cos: number;
  sin: number;
}

const zeroFlight: Flight = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: -1, t: 0, v0: 0, k: 0, g: 0, wx: 0, wz: 0 };
const at = vec3();

/**
 * The zero for a range: the bore's elevation above a level line of sight at which the
 * bullet, in still air, comes back to the line of sight `range` metres out. The bullet
 * leaves from the eye, so it starts on the line of sight. Bisection with a fixed number
 * of halvings (rule 18); the elevation's cosine and sine come from its own series, since
 * the angle is small (well under 0.1 rad).
 */
export function zeroFor(range: number, b: Pick<Ballistic, 'v0' | 'k' | 'g'>, maxFlight: number): Zero {
  const f = zeroFlight;
  f.v0 = b.v0;
  f.k = b.k;
  f.g = b.g;
  let lo = 0;
  let hi = 0.2;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    const { cos, sin } = smallAngle(mid);
    f.dx = 0;
    f.dy = sin;
    f.dz = -cos;
    const t = timeAtRange(f, 0, 0, -1, range, maxFlight);
    flightAt(f, t, at);
    if (!Number.isFinite(t) || at.y < 0) lo = mid;
    else hi = mid;
  }
  const elevation = (lo + hi) / 2;
  const { cos, sin } = smallAngle(elevation);
  return { range, elevation, cos, sin };
}

/** Cosine and sine of an angle under about 0.3 rad, by series to well below a femtoradian. */
export function smallAngle(a: number): { cos: number; sin: number } {
  const a2 = a * a;
  const sin = a * (1 - (a2 / 6) * (1 - (a2 / 20) * (1 - (a2 / 42) * (1 - a2 / 72))));
  const cos = 1 - (a2 / 2) * (1 - (a2 / 12) * (1 - (a2 / 30) * (1 - (a2 / 56) * (1 - a2 / 90))));
  return { cos, sin };
}

const shot: Flight = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: -1, t: 0, v0: 0, k: 0, g: 0, wx: 0, wz: 0 };
const los = vec3();
const aimAt = vec3();
const hit = vec3();

/**
 * Where a shot from `eye` along the unit line of sight `sight` crosses the plane square
 * to `dir` (a unit vector from the eye) at `range` metres, and when: the point is written
 * to `out`, and the mission time since launch returned (Infinity if it never gets there).
 */
export function landing(eye: Vec3, sight: Vec3, dir: Vec3, range: number, zero: Zero, b: Ballistic, maxFlight: number, out: Vec3): number {
  launch(shot, eye, sight, zero, b, 0);
  const t = timeAtRange(shot, dir.x, dir.y, dir.z, range, maxFlight);
  if (!Number.isFinite(t)) return Infinity;
  flightAt(shot, t, out);
  return t;
}

/**
 * The line of sight that puts a shot from `eye` on `target`, written to `out` (a unit
 * vector), and the time of flight returned. A moving target (velocity `vx`, `vz`, m/s)
 * is led: the shot goes where it will be when the bullet arrives. Fixed-point iteration
 * on the aim point, a fixed number of times (rule 18): the miss shrinks a thousandfold
 * each round, so six rounds leave nothing a ruler could find.
 */
export function solveAim(eye: Vec3, target: Vec3, vx: number, vz: number, zero: Zero, b: Ballistic, maxFlight: number, out: Vec3): number {
  // Aim at the target first, then move the aim point against each miss.
  aimAt.x = target.x;
  aimAt.y = target.y;
  aimAt.z = target.z;
  let t = 0;
  for (let k = 0; k < 6; k++) {
    unit(aimAt.x - eye.x, aimAt.y - eye.y, aimAt.z - eye.z, los);
    // Where the target is when the bullet gets there (its height doesn't change: a walker).
    const tx = target.x + vx * t;
    const tz = target.z + vz * t;
    const dx = tx - eye.x;
    const dy = target.y - eye.y;
    const dz = tz - eye.z;
    const range = Math.sqrt(dx * dx + dy * dy + dz * dz);
    unit(dx, dy, dz, dir);
    t = landing(eye, los, dir, range, zero, b, maxFlight, hit);
    if (!Number.isFinite(t)) break;
    aimAt.x -= hit.x - tx;
    aimAt.y -= hit.y - target.y;
    aimAt.z -= hit.z - tz;
  }
  unit(aimAt.x - eye.x, aimAt.y - eye.y, aimAt.z - eye.z, out);
  return t;
}

const dir = vec3();

/** The hold, in the reticle's mils, between a unit line of sight and a unit direction to the target. */
export function holdBetween(sight: Vec3, target: Vec3, out: Hold): Hold {
  sightFrame(sight.x, sight.y, sight.z, sf);
  const f = target.x * sight.x + target.y * sight.y + target.z * sight.z;
  const u = target.x * sf.ux + target.y * sf.uy + target.z * sf.uz;
  const r = target.x * sf.rx + target.z * sf.rz;
  // The target sits `u/f` up and `r/f` right on the reticle's plane; the hold is the other way.
  out.up = (-u / f) * 1000;
  out.right = (-r / f) * 1000;
  return out;
}

/** A unit vector along (x, y, z), written to `out`. */
export function unit(x: number, y: number, z: number, out: Vec3): Vec3 {
  const l = Math.sqrt(x * x + y * y + z * z);
  out.x = x / l;
  out.y = y / l;
  out.z = z / l;
  return out;
}

/**
 * The unit direction a reticle mark points along: the mark `up` mils above and `right`
 * mils right of the centre (negative below and left), on the scope's line of sight. The
 * inverse of holdBetween: the target of a hold sits on the mark at (−up, −right).
 */
export function markDirection(sight: Vec3, up: number, right: number, out: Vec3): Vec3 {
  sightFrame(sight.x, sight.y, sight.z, sf);
  const a = up / 1000;
  const c = right / 1000;
  return unit(sight.x + sf.ux * a + sf.rx * c, sight.y + sf.uy * a, sight.z + sf.uz * a + sf.rz * c, out);
}

/** The unit line of sight for view angles (math.ts's yaw convention: 0 faces north, turning left). */
export function lineOfSight(yaw: number, pitch: number, out: Vec3): Vec3 {
  const cp = dcos(pitch);
  out.x = -dsin(yaw) * cp;
  out.y = dsin(pitch);
  out.z = -dcos(yaw) * cp;
  return out;
}

const viewLos = vec3();

/**
 * Where the camera looks, for view angles and a sway sample (rifle.ts): the line of sight
 * moved by the sway as far as the scope is up. With the scope fully up this is exactly
 * the line a shot leaves along (before the zero turns the bore up), which is what makes
 * the drawn reticle tell the truth; with it down, the eye doesn't follow the rifle.
 */
export function viewLine(yaw: number, pitch: number, sway: { up: number; right: number; raise: number }, out: Vec3): Vec3 {
  lineOfSight(yaw, pitch, viewLos);
  return markDirection(viewLos, sway.up * sway.raise, sway.right * sway.raise, out);
}
