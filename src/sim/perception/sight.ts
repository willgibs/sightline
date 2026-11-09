import type { Tuning } from '../../config/tuning';
import type { BodySpec, BodyState } from '../body';
import { datan2, dcos, dexp, dsin } from '../kernel/core/detmath';
import type { EnvSpec } from '../kernel/env';
import type { EntityId } from '../kernel/state';
import { Blocks } from '../kernel/world/colliders';
import { emptyHit, IGNORE_CROWNS, raycast, type QueryBody, type QueryView } from '../kernel/world/query';
import type { BodyShape } from '../kernel/world/shape';
import { foliageOf } from './foliage';
import { crownsOf } from '../kernel/world/foliage';
import { groundLight } from './light';
import { movementVisibility, stanceVisibility } from './visibility';

/**
 * Sight: how exposed a body is to an eye, and how fast that fills the eye's detection
 * meter (design doc · Enemy perception · Sight, as the owner read it on Nov 7).
 *
 * - **Zones.** Each zone (core, peripheral, and a marksman's far) has a half-angle off the
 *   gaze and a range for the reference body: standing, walking, lit, in the open. The most
 *   inclusive zone at the body's angle sets the range (Blacklist).
 * - **Range caps.** Stance, the light at the ground beneath the body, and open sky behind
 *   it scale the range (the factors in `visibility`). They are boundaries you can learn:
 *   prone, a guard's core cone reaches 45 m; standing on a crest, 225 m.
 * - **Time.** Inside the range, the meter fills in a time that grows linearly with
 *   distance, from `fill.near` at the eye to `fill.edge` at the range. Movement and the
 *   share of the body in view (rays to head, chest and feet, through foliage) scale how
 *   fast.
 * - **No cliffs.** Every edge ramps: a cone's over `edgeDeg`, a range's over a few metres.
 * - **Telegraphed.** Outside the contact zone, the fill is never faster than lets the first
 *   cue (the meter at `cue`) come `minCueSeconds` before 100%, whatever else is true. In
 *   the contact zone, close enough to touch, a body is noticed in any direction, quickly.
 *
 * Exposure is computed for any observer, so in Phase 2 the player can be one. It is a pure
 * function of the world as it stands, the eye and the body, so every number in it can be
 * explained (explain.ts) and drawn (the debug view).
 */

export type Zone = 'core' | 'peripheral' | 'far' | 'contact' | 'none';
export const ZONES: readonly Zone[] = ['core', 'peripheral', 'far', 'contact', 'none'];

/** Who is looking. */
export interface Observer {
  /** Its own body, which its rays pass through. */
  id: EntityId;
  /** The eye. */
  x: number;
  y: number;
  z: number;
  /** Where it looks: body yaw plus head turn, and pitch. */
  yaw: number;
  pitch: number;
  /** Whether it has the far zone: a marksman's binoculars. */
  far: boolean;
  /** How much quicker than usual its eyes are (1; more after a search). */
  sharp: number;
}

/** Who is looked at: a body, its kind, and its shape as it stands now. */
export interface SightTarget {
  id: EntityId;
  body: BodyState;
  spec: BodySpec;
  shape: BodyShape;
}

/** One of the three rays: to the head, the chest or the feet. */
export interface SightRay {
  x: number;
  y: number;
  z: number;
  /** Nothing solid in the way. */
  clear: boolean;
  /** What the foliage on the way lets through (1 with none). */
  through: number;
  /**
   * How much of what's behind it, as the eye sees it, is open sky: 0 to 1. A line on past
   * the body that rises and meets nothing is sky; one that meets ground far off is partly
   * sky (the horizon); each ramps, so a body crossing the skyline brightens gradually.
   */
  sky: number;
}

export interface Exposure {
  /** Eye to chest, metres; and the chest's angle off the gaze, degrees. */
  distance: number;
  angleDeg: number;
  /** The zone that sets the rate (contact, when it's the faster), or none. */
  zone: Zone;
  /** How far into its zone by angle (1 well inside, 0 outside): the cone's ramp. */
  cone: number;
  /** The caps: stance, the light beneath the body, and the sky behind it (1 to `skyline`). */
  stance: number;
  light: number;
  skyline: number;
  /** The zone's range for this body now (its reference range times the caps), and how much of its rate the range's edge ramp leaves (1 well inside). */
  range: number;
  edge: number;
  /** The seconds to fill at this distance, before the rate factors. */
  seconds: number;
  /** The rate factors: movement, and the share of the body in view, foliage counted. */
  movement: number;
  cover: number;
  /** How many rays are clear of anything solid. */
  clear: number;
  rays: [head: SightRay, chest: SightRay, feet: SightRay];
  /** How fast the meter fills, per second, and whether the telegraph's cap held it down. */
  rate: number;
  capped: boolean;
}

export function emptyExposure(): Exposure {
  const ray = (): SightRay => ({ x: 0, y: 0, z: 0, clear: false, through: 0, sky: 0 });
  return {
    distance: 0,
    angleDeg: 0,
    zone: 'none',
    cone: 0,
    stance: 0,
    light: 0,
    skyline: 1,
    range: 0,
    edge: 0,
    seconds: 0,
    movement: 0,
    cover: 0,
    clear: 0,
    rays: [ray(), ray(), ray()],
    rate: 0,
    capped: false,
  };
}

/** How much of a zone's rate a cone's edge leaves at `angle`: 1 inside, ramping to 0 across `edgeDeg`. */
export function coneRamp(angleDeg: number, halfDeg: number, edgeDeg: number): number {
  const v = (halfDeg + edgeDeg / 2 - angleDeg) / edgeDeg;
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

/** The width of a range's edge ramp, metres. */
export function edgeWidth(range: number, S: Tuning['perception']['sight']): number {
  const w = S.edgeShare * range;
  return w < S.edgeMin ? S.edgeMin : w > S.edgeMax ? S.edgeMax : w;
}

/** How much of a zone's rate a range's edge leaves at `d`: 1 inside, ramping to 0 across the edge band, centred on the range. */
export function rangeRamp(d: number, range: number, S: Tuning['perception']['sight']): number {
  if (!(range > 0)) return 0;
  const w = edgeWidth(range, S);
  const v = (range + w / 2 - d) / w;
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

/** Seconds to fill the meter at distance `d` inside a range: linear from `fill.near` to `fill.edge`. */
export function fillSeconds(d: number, range: number, S: Tuning['perception']['sight']): number {
  const f = range > 0 ? (d < range ? d / range : 1) : 1;
  return S.fill.near + (S.fill.edge - S.fill.near) * f;
}

/** The fastest fill outside the contact zone: what lets the cue come `minCueSeconds` before 100%. */
export function telegraphCap(S: Tuning['perception']['sight']): number {
  return (1 - S.cue) / S.minCueSeconds;
}

/** Where the three rays aim on a body: its head, its chest (high on the torso) and its feet. */
export function aimPoints(shape: BodyShape, out: Exposure['rays']): Exposure['rays'] {
  const [head, chest, feet] = out;
  head.x = shape.head.x;
  head.y = shape.head.y;
  head.z = shape.head.z;
  const t = shape.torso;
  chest.x = t.ax + (t.bx - t.ax) * 0.6;
  chest.y = t.ay + (t.by - t.ay) * 0.6;
  chest.z = t.az + (t.bz - t.az) * 0.6;
  feet.x = shape.legs.ax;
  feet.y = shape.legs.ay;
  feet.z = shape.legs.az;
  return out;
}

const hit = emptyHit();
const weights = [0, 0, 0];
const others: QueryBody[] = [];
const view: { world: QueryView['world']; solids: QueryView['solids']; bodies: QueryBody[]; work?: QueryView['work'] } = {
  world: null as never,
  solids: null as never,
  bodies: others,
};

/**
 * How exposed `target` is to `eye`, written to `out`: every factor, the three rays, and
 * the meter's fill rate per second. `view` is the world as it stands (TickContext.query);
 * `t` the mission time, for the sun.
 */
export function exposure(at: QueryView, env: EnvSpec, t: number, tuning: Tuning, eye: Observer, target: SightTarget, out: Exposure): Exposure {
  const S = tuning.perception.sight;
  const V = tuning.visibility;
  const rays = aimPoints(target.shape, out.rays);
  const chest = rays[1];
  const dx = chest.x - eye.x;
  const dy = chest.y - eye.y;
  const dz = chest.z - eye.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  out.distance = d;
  // The angle between the gaze and the line to the chest.
  const cp = dcos(eye.pitch);
  const fx = -dsin(eye.yaw) * cp;
  const fy = dsin(eye.pitch);
  const fz = -dcos(eye.yaw) * cp;
  const cx = fy * dz - fz * dy;
  const cy = fz * dx - fx * dz;
  const cz = fx * dy - fy * dx;
  const angle = d > 1e-9 ? datan2(Math.sqrt(cx * cx + cy * cy + cz * cz), fx * dx + fy * dy + fz * dz) : 0;
  out.angleDeg = (angle * 180) / Math.PI;
  out.stance = stanceVisibility(target.body, target.spec, tuning);
  out.movement = movementVisibility(target.body, target.spec, tuning);
  out.zone = 'none';
  out.cone = 0;
  out.light = 0;
  out.skyline = 1;
  out.range = 0;
  out.edge = 0;
  out.seconds = 0;
  out.cover = 0;
  out.clear = 0;
  out.rate = 0;
  out.capped = false;
  for (const r of rays) {
    r.clear = false;
    r.through = 0;
    r.sky = 0;
  }

  // Each zone's membership by angle, and the farthest any of them could reach.
  const core = coneRamp(out.angleDeg, S.core.halfDeg, S.edgeDeg);
  const wide = coneRamp(out.angleDeg, S.peripheral.halfDeg, S.edgeDeg);
  const far = eye.far ? coneRamp(out.angleDeg, S.far.halfDeg, S.edgeDeg) : 0;
  const contact = S.contact.range + S.contact.ramp;
  const reachOf = (range: number): number => range + edgeWidth(range, S) / 2;
  const capMax = out.stance * V.light.lit * V.skyline;
  let reach = 0;
  if (core > 0) reach = Math.max(reach, reachOf(S.core.range * capMax));
  if (wide > 0) reach = Math.max(reach, reachOf(S.peripheral.range * capMax));
  if (far > 0) reach = Math.max(reach, reachOf(S.far.range * capMax));
  // Out of every zone's reach: nothing to look at, and no rays spent (a distant guard skips perception).
  if (d > reach && d > contact) return out;

  out.light = groundLight(at.world, at.solids, env, t, target.body.x, target.body.y, target.body.z, tuning);

  // The rays, past everything but the target's own body, through the foliage between.
  view.world = at.world;
  view.solids = at.solids;
  view.work = at.work;
  others.length = 0;
  for (const b of at.bodies) if (b.id !== target.id) others.push(b);
  const foliage = foliageOf(at.world);
  const crowns = crownsOf(at.world);
  const crownStop = at.world.crownStop ?? Infinity;
  const W = weights;
  W[0] = S.parts.head;
  W[1] = S.parts.chest;
  W[2] = S.parts.feet;
  let seen = 0;
  let sky = 0;
  for (let k = 0; k < 3; k++) {
    const r = rays[k]!;
    const rx = r.x - eye.x;
    const ry = r.y - eye.y;
    const rz = r.z - eye.z;
    const len = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (len < 1e-9) {
      r.clear = true;
      r.through = 1;
    } else {
      const ux = rx / len;
      const uy = ry / len;
      const uz = rz / len;
      // The crowns from the two ends, so this is the same whichever end is the eye.
      raycast(view, eye.x, eye.y, eye.z, ux, uy, uz, len, Blocks.Sight, hit, eye.id, IGNORE_CROWNS);
      r.clear = hit.dist >= len - 1e-6;
      const crown = r.clear ? crowns.opticalDepth(eye.x, eye.y, eye.z, r.x, r.y, r.z, true) : 0;
      if (crown >= crownStop) r.clear = false;
      if (r.clear) {
        r.through = foliage.transmittance(eye.x, eye.y, eye.z, r.x, r.y, r.z) * (crown === 0 ? 1 : dexp(-crown));
        r.sky = skyBehind(r, ux, uy, uz, foliage, S);
      }
    }
    if (!r.clear) continue;
    out.clear++;
    const w = W[k]! * r.through;
    seen += w;
    sky += w * r.sky;
  }
  out.cover = seen;
  // The share of what's in view that stands against the sky (for explaining; each part's range uses its own).
  out.skyline = seen > 0 ? 1 + (V.skyline - 1) * (sky / seen) : 1;
  return exposureRate(out, eye.far, eye.sharp, minClear(target, tuning), tuning);
}

/** Whether a point is inside the gaze: within `halfDeg` of where the eye looks. */
export function inGaze(eye: Observer, x: number, y: number, z: number, halfDeg: number): boolean {
  const dx = x - eye.x;
  const dy = y - eye.y;
  const dz = z - eye.z;
  const cp = dcos(eye.pitch);
  const fx = -dsin(eye.yaw) * cp;
  const fy = dsin(eye.pitch);
  const fz = -dcos(eye.yaw) * cp;
  const cx = fy * dz - fz * dy;
  const cy = fz * dx - fx * dz;
  const cz = fx * dy - fy * dx;
  return (datan2(Math.sqrt(cx * cx + cy * cy + cz * cz), fx * dx + fy * dy + fz * dz) * 180) / Math.PI <= halfDeg;
}

/**
 * Whether the line from the eye to a point is open: nothing solid on it, up to `stop`
 * metres short of the point (so whoever is at the point doesn't block it), and the
 * foliage on the way letting through at least `through`.
 */
export function lineOpen(at: QueryView, eye: Observer, x: number, y: number, z: number, stop: number, through: number): boolean {
  const dx = x - eye.x;
  const dy = y - eye.y;
  const dz = z - eye.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len <= stop) return true;
  raycast(at, eye.x, eye.y, eye.z, dx / len, dy / len, dz / len, len - stop, Blocks.Sight, hit, eye.id);
  return hit.dist >= len - stop - 1e-6 && foliageOf(at.world).transmittance(eye.x, eye.y, eye.z, x, y, z) >= through;
}

/**
 * The rate law alone: from what exposure measured (distance, angle, stance, light,
 * movement, and each ray's clearance, foliage and sky, in `x`), the zone, the range and
 * how fast the meter fills, written into `x`. Pure arithmetic, so the factor-grid sweep
 * (sweep.ts) can run it over every combination of the design's factors.
 */
export function exposureRate(x: Exposure, far: boolean, sharp: number, minClearRays: number, tuning: Tuning): Exposure {
  const S = tuning.perception.sight;
  const V = tuning.visibility;
  x.zone = 'none';
  x.cone = 0;
  x.range = 0;
  x.edge = 0;
  x.seconds = 0;
  x.rate = 0;
  x.capped = false;
  if (x.clear < minClearRays || x.cover <= 0) return x;
  const d = x.distance;
  const rays = x.rays;
  const W = weights;
  W[0] = S.parts.head;
  W[1] = S.parts.chest;
  W[2] = S.parts.feet;
  // The zone that fills fastest here sets the rate. Each part in view adds its share, at its
  // own range: a part against the sky is seen farther. Summing parts (rather than scaling
  // by the sky's share) keeps it monotone: more of you in view never fills more slowly.
  const caps = x.stance * x.light;
  let best = 0;
  const consider = (zone: Zone, cone: number, reference: number): void => {
    if (cone <= 0) return;
    const range = reference * caps;
    let rate = 0;
    let edge = 0;
    for (let k = 0; k < 3; k++) {
      const r = rays[k]!;
      if (!r.clear) continue;
      const own = range * (1 + (V.skyline - 1) * r.sky);
      const e = rangeRamp(d, own, S);
      if (e <= 0) continue;
      rate += (W[k]! * r.through * cone * e) / fillSeconds(d, own, S);
      if (e > edge) edge = e;
    }
    if (rate > best) {
      best = rate;
      x.zone = zone;
      x.cone = cone;
      x.range = range;
      x.edge = edge;
      x.seconds = fillSeconds(d, range, S);
    }
  };
  consider('core', coneRamp(x.angleDeg, S.core.halfDeg, S.edgeDeg), S.core.range);
  consider('peripheral', coneRamp(x.angleDeg, S.peripheral.halfDeg, S.edgeDeg), S.peripheral.range);
  if (far) consider('far', coneRamp(x.angleDeg, S.far.halfDeg, S.edgeDeg), S.far.range);
  let rate = best * x.movement * sharp;
  const cap = telegraphCap(S);
  if (rate > cap) {
    rate = cap;
    x.capped = true;
  }
  // Close enough to touch, in any direction.
  const contact = S.contact.range + S.contact.ramp;
  const touch = d < contact ? (d <= S.contact.range ? 1 : (contact - d) / S.contact.ramp) : 0;
  const near = (touch * x.movement * x.cover) / S.contact.seconds;
  if (near > rate) {
    rate = near;
    x.zone = 'contact';
    x.cone = 1;
    x.capped = false;
    x.range = S.contact.range;
    x.edge = touch;
    x.seconds = S.contact.seconds;
  }
  x.rate = rate;
  return x;
}

/**
 * How much open sky is behind a point on a body, along the eye's line on past it: the line
 * must rise (it ramps from level, over `skylineRampDeg`), and meet nothing near: ground
 * beyond half the reach counts partly, beyond the reach not at all; foliage behind dims it.
 */
function skyBehind(r: SightRay, ux: number, uy: number, uz: number, foliage: ReturnType<typeof foliageOf>, S: Tuning['perception']['sight']): number {
  // Small angles: a line's rise in radians is its vertical component.
  const rise = S.skylineRampDeg * (Math.PI / 180);
  const up = (uy + rise) / (2 * rise);
  if (up <= 0) return 0;
  raycast(view, r.x, r.y, r.z, ux, uy, uz, S.skylineReach, Blocks.Sight, hit, -1);
  const half = S.skylineReach / 2;
  const far = hit.what === 'none' ? 1 : hit.dist <= half ? 0 : (hit.dist - half) / half;
  if (far <= 0) return 0;
  const near = hit.what === 'none' ? S.skylineReach : hit.dist;
  const reach = near < 300 ? near : 300;
  const through = foliage.transmittance(r.x, r.y, r.z, r.x + ux * reach, r.y + uy * reach, r.z + uz * reach);
  return (up >= 1 ? 1 : up) * far * through;
}

/** Rays that must be clear before the meter moves, for the body's stance now. */
export function minClear(target: SightTarget, tuning: Tuning): number {
  const m = tuning.perception.sight.minClear;
  const E = target.spec.eyeHeight;
  const e = target.body.eyeHeight;
  return e >= (E.stand + E.crouch) / 2 ? m.stand : e >= (E.crouch + E.prone) / 2 ? m.crouch : m.prone;
}
