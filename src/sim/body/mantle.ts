import { datan2, dcos, dsin, dtanDeg } from '../kernel/core/detmath';
import { smoothstep } from '../kernel/core/math';
import type { DebugDraw } from '../kernel/debugDraw';
import { Blocks, circleOverlaps, footprintContains, type Collider } from '../kernel/world/colliders';
import { makeTerrainSample } from '../kernel/world/heightfield';
import { surfaceLoudness, type Surface } from '../kernel/world/surfaces';
import { bodyHeight, groundBelow, rimExcess, type BodySpec, type BodyState, type MantleState } from './body';
import type { MotorContext } from './motor';
import { requestStance } from './stance';

/**
 * The mantle: a motor mode that takes a body up onto or over something low, and through
 * windows. Nothing about it is automatic: a press starts it, so the noise it makes is
 * one the player chose. Three probes find the ledge (The Dark Mod's): forward at several
 * heights for the face, down for its top, and an overlap at the landing pose. The body
 * then follows a path of four eased legs: reach for the ledge (hang), pull up, shift
 * across, and push down to land. It goes up crouched, so a window that fits a crouch
 * fits a mantle.
 *
 * Only something solid can be mantled, never the terrain, and never onto ground too
 * steep to stand on: the motor's rule that no body gains height on such ground holds
 * here too.
 *
 * Promises (motor.ts, and the invariant run):
 * - every pose of the path is re-checked every tick, against everything solid (with no
 *   allowance for steps) and every other body, and the body never ends a tick in one
 *   that isn't clear: where the seed of this mode validates the endpoint once and clips
 *   whatever moves in afterwards, this one waits, and gives up if the way stays blocked;
 * - it rises no more than stepHeight in a tick, by the path's own rate.
 */

const hit = { dist: Infinity, id: -1 };
const ids: number[] = [];
const sample = makeTerrainSample();
const pose = { x: 0, y: 0, z: 0 };
const normal = { x: 0, z: 0 };

/** The outward normal of a collider at a point on its side. */
function faceNormal(c: Collider, x: number, z: number, out: { x: number; z: number }): void {
  const px = x - c.x;
  const pz = z - c.z;
  if (c.kind === 'cyl') {
    const l = Math.sqrt(px * px + pz * pz);
    out.x = l > 1e-9 ? px / l : 1;
    out.z = l > 1e-9 ? pz / l : 0;
    return;
  }
  const lx = px * c.ux + pz * c.uz;
  const lz = -px * c.uz + pz * c.ux;
  let nx = 0;
  let nz = 0;
  if (c.hx - Math.abs(lx) < c.hz - Math.abs(lz)) nx = lx >= 0 ? 1 : -1;
  else nz = lz >= 0 ? 1 : -1;
  out.x = nx * c.ux - nz * c.uz;
  out.z = nx * c.uz + nz * c.ux;
}

/** True if a body of this height can stand at (x, y, z): nothing solid in the way (no step allowance), the ground under its feet, no other body. */
export function poseClear(x: number, y: number, z: number, height: number, spec: BodySpec, ctx: MotorContext): boolean {
  const r = spec.radius;
  const { world, solids } = ctx;
  if (world.terrain.heightAt(x, z) > y + 1e-3) return false;
  if (rimExcess(world, x, z, y, r, spec.stepHeight) > 1e-3) return false;
  solids.query(x - r, z - r, x + r, z + r, ids);
  for (let q = 0; q < ids.length; q++) {
    const c = solids.get(ids[q]!);
    if ((c.flags & Blocks.Move) === 0 || c.y1 <= y + 1e-3 || c.y0 >= y + height - 1e-6) continue;
    if (circleOverlaps(c, x, z, r - 1e-4)) return false;
  }
  for (let k = 0; k < ctx.others.length; k++) {
    const o = ctx.others[k]!;
    if (o.y >= y + height || o.y + o.height <= y) continue;
    const dx = x - o.x;
    const dz = z - o.z;
    const rr = r + o.radius - 1e-4;
    if (dx * dx + dz * dz < rr * rr) return false;
  }
  return true;
}

/** Where a mantle is at `t` seconds along its path. */
/** A path can cross rising ground while reaching for the ledge: its feet stay on top of it. */
function keepOnGround(world: MotorContext['world'], p: MantlePose): void {
  const ground = world.terrain.heightAt(p.x, p.z);
  if (p.y < ground) p.y = ground;
}

/** A point along a path (mantle, ladder). */
export interface MantlePose {
  x: number;
  y: number;
  z: number;
}

export function mantleAt(m: MantleState, t: number, out: MantlePose): MantlePose {
  let rest = t;
  let k = 0;
  while (k < m.legs.length - 1 && rest >= m.legs[k]!) {
    rest -= m.legs[k]!;
    k++;
  }
  const T = m.legs[k]!;
  const f = T > 0 ? smoothstep(0, 1, rest / T) : 1;
  const P = m.points;
  const i = k * 3;
  out.x = P[i]! + (P[i + 3]! - P[i]!) * f;
  out.y = P[i + 1]! + (P[i + 4]! - P[i + 1]!) * f;
  out.z = P[i + 2]! + (P[i + 5]! - P[i + 2]!) * f;
  return out;
}

function totalTime(m: MantleState): number {
  let s = 0;
  for (let k = 0; k < m.legs.length; k++) s += m.legs[k]!;
  return s;
}

const planned: MantleState = { t: 0, waited: 0, points: [], legs: [], grabAt: 0, stand: false, grip: 0, feet: 0, grabbed: false, dropped: 0, then: -1 };

/**
 * Finds a mantle from where the body stands, facing as it faces: `out` gets its path,
 * checked pose by pose against the world as it stands now. False if nothing can be
 * mantled here. Reads the world and writes only `out`.
 */
function plan(b: Pick<BodyState, 'x' | 'y' | 'z' | 'yaw' | 'motor' | 'sliding' | 'proneTransition' | 'stance' | 'eyeHeight'>, spec: BodySpec, ctx: MotorContext, out: MantleState): boolean {
  const M = spec.mantle;
  if (b.motor !== 'ground' || b.sliding || b.proneTransition || b.stance === 'prone') return false;
  const { world, solids } = ctx;
  const r = spec.radius;
  const y0 = b.y;
  const fx = -dsin(b.yaw);
  const fz = -dcos(b.yaw);
  const reach = r + M.reach;

  // --- Forward, at several heights: where the face is, and the first height above it that's open. ---
  let faceDist = -1;
  let faceId = -1;
  let open = -1;
  const top_ = spec.stepHeight;
  const rise = (M.maxHeight + 0.1 - top_) / (M.probes - 1);
  for (let k = 0; k < M.probes; k++) {
    const h = y0 + top_ + rise * k;
    solids.raycast(b.x, h, b.z, fx, 0, fz, reach, Blocks.Move, hit);
    if (hit.id >= 0) {
      if (faceDist < 0) {
        faceDist = hit.dist;
        faceId = hit.id;
      }
    } else if (faceDist >= 0) {
      open = h;
      break;
    }
  }
  if (faceDist < 0 || open < 0) return false;

  // The face's normal: the body goes over square to it, whatever angle it came at.
  const hx = b.x + fx * faceDist;
  const hz = b.z + fz * faceDist;
  const face = solids.get(faceId);
  faceNormal(face, hx, hz, normal);
  const dx = -normal.x;
  const dz = -normal.z;
  const along = fx * dx + fz * dz;
  if (along < M.squareCos) return false;
  const dist = faceDist * along; // from the body's centre to the face, square on

  // --- Down, just past the face: the top of the ledge. ---
  const qx = b.x + dx * (dist + 0.04);
  const qz = b.z + dz * (dist + 0.04);
  let top = -Infinity;
  let grip: Surface = 0;
  solids.query(qx, qz, qx, qz, ids);
  for (let k = 0; k < ids.length; k++) {
    const c = solids.get(ids[k]!);
    if ((c.flags & Blocks.Move) === 0 || c.y1 > open || c.y1 <= y0 + spec.stepHeight) continue;
    if (!footprintContains(c, qx, qz, 0)) continue;
    if (c.y1 > top) {
      top = c.y1;
      grip = c.surface;
    }
  }
  if (top === -Infinity || top > y0 + M.maxHeight) return false;
  if (world.terrain.heightAt(qx, qz) >= top) return false; // terrain is never mantled

  // How deep the ledge is, along the way over.
  let depth = 0.04;
  const y = top - 0.05;
  for (; depth < M.overDepth + 0.5; depth += 0.05) {
    const px = b.x + dx * (dist + depth);
    const pz = b.z + dz * (dist + depth);
    solids.query(px, pz, px, pz, ids);
    let inside = false;
    for (let k = 0; k < ids.length; k++) {
      const c = solids.get(ids[k]!);
      if ((c.flags & Blocks.Move) !== 0 && c.y0 <= y && c.y1 >= y && footprintContains(c, px, pz, 0)) {
        inside = true;
        break;
      }
    }
    if (!inside) break;
  }

  // --- Where it lands: down the far side of something thin, or up on something deep. ---
  const tanMax = dtanDeg(spec.maxSlopeDeg);
  const margin = r + 0.03;
  const land = (over: boolean): { x: number; y: number; z: number; surface: Surface } | null => {
    const s = over ? dist + depth + margin : dist + margin;
    const x = b.x + dx * s;
    const z = b.z + dz * s;
    if (Math.abs(x) > world.playHalf || Math.abs(z) > world.playHalf) return null;
    const g = groundBelow(world, solids, x, z, top + 0.02, r);
    if (!over && g.height < top - 1e-3) return null;
    if (over && top - g.height > M.maxDrop) return null;
    if (g.collider < 0 && world.terrain.sample(x, z, sample).slopeTan > tanMax) return null;
    return { x, y: g.height, z, surface: g.surface };
  };
  const firstOver = depth <= M.overDepth;
  const landing = land(firstOver) ?? land(!firstOver);
  if (!landing) return false;

  // --- The path: reach for the ledge, pull up, shift over, push down. ---
  const skin = Math.max(0, dist - r - 0.003);
  const bx = b.x + dx * skin;
  const bz = b.z + dz * skin;
  const up = top + M.lift;
  out.t = 0;
  out.waited = 0;
  out.points.length = 0;
  out.points.push(b.x, y0, b.z, bx, y0, bz, bx, up, bz, landing.x, up, landing.z, landing.x, landing.y, landing.z);
  out.legs.length = 0;
  out.legs.push(M.hang + skin / M.shiftSpeed);
  out.legs.push(Math.max(M.minLeg, (up - y0) / M.pullSpeed));
  out.legs.push(Math.max(M.minLeg, Math.sqrt((landing.x - bx) * (landing.x - bx) + (landing.z - bz) * (landing.z - bz)) / M.shiftSpeed));
  out.legs.push(Math.max(M.minLeg * 0.5, (up - landing.y) / M.dropSpeed));
  out.grabAt = out.legs[0]!;
  out.then = -1;
  out.stand = b.stance === 'stand';
  out.grip = grip;
  out.feet = landing.surface;
  out.grabbed = false;
  out.dropped = top - landing.y;

  // Every pose it would take, as the world stands now. The body is crouched by the time it
  // goes over, the eye easing down as a stance change would.
  const dt = ctx.dt;
  const total = totalTime(out);
  const crouch = spec.eyeHeight.crouch;
  const clearance = spec.height.crouch - crouch;
  const ease = spec.stanceTime.crouch;
  for (let k = 1; ; k++) {
    const t = k * dt < total ? k * dt : total;
    mantleAt(out, t, pose);
    keepOnGround(world, pose);
    const eye = b.eyeHeight + (crouch - b.eyeHeight) * smoothstep(0, 1, ease > 0 ? t / ease : 1);
    const height = Math.max(spec.height.crouch, eye + clearance);
    if (!poseClear(pose.x, pose.y, pose.z, height, spec, ctx)) return false;
    if (t >= total) break;
  }
  return true;
}

const scratchPose = { x: 0, y: 0, z: 0, yaw: 0, motor: 'ground' as const, sliding: false, proneTransition: false, stance: 'crouch' as const, eyeHeight: 0 };

/**
 * A mantle from a ladder's top pose: from (x, y, z), facing (fx, fz), or, for getting on
 * from the top, that same way run backwards from where the body stands now, so the top of
 * a ladder is got on and off by the same checked poses. Null if there is no way.
 */
export function planMantleFrom(b: BodyState | null, x: number, y: number, z: number, fx: number, fz: number, spec: BodySpec, ctx: MotorContext, backwards: boolean): MantleState | null {
  const p = scratchPose;
  p.x = x;
  p.y = y;
  p.z = z;
  p.yaw = datan2(-fx, -fz);
  p.eyeHeight = b ? b.eyeHeight : spec.eyeHeight.crouch; // it eases down to a crouch from wherever it is
  if (!plan(p, spec, ctx, planned)) return null;
  const m: MantleState = { ...planned, points: [...planned.points], legs: [...planned.legs], stand: false };
  if (backwards && b) {
    // Run the path the other way: from where the body is, up over the edge to the ladder.
    const n = m.points.length / 3;
    const pts: number[] = [];
    for (let k = n - 1; k >= 0; k--) pts.push(m.points[k * 3]!, m.points[k * 3 + 1]!, m.points[k * 3 + 2]!);
    m.legs.reverse();
    // A first leg from where it stands to the path's start.
    const legs = m.legs;
    const dx = pts[0]! - b.x;
    const dy = pts[1]! - b.y;
    const dz = pts[2]! - b.z;
    m.points = [b.x, b.y, b.z, ...pts];
    m.legs = [Math.max(spec.mantle.minLeg, Math.sqrt(dx * dx + dy * dy + dz * dz) / spec.mantle.shiftSpeed), ...legs];
    m.grabAt = 0;
  }
  return m;
}

/** Whether a press now would start a mantle: what the prompt shows. Reads the world and changes nothing. */
export function canMantle(b: BodyState, spec: BodySpec, ctx: MotorContext): boolean {
  return plan(b, spec, ctx, planned);
}

/** Starts a mantle, if one can be found: a crouch for the way over, then the path. Returns whether it started. */
export function startMantle(b: BodyState, spec: BodySpec, ctx: MotorContext): boolean {
  if (!plan(b, spec, ctx, planned)) return false;
  b.mantle = { ...planned, points: [...planned.points], legs: [...planned.legs] };
  b.motor = 'mantle';
  b.vx = 0;
  b.vy = 0;
  b.vz = 0;
  b.sliding = false;
  if (b.stance !== 'crouch') requestStance(b, 'crouch', spec, ctx);
  return true;
}

/**
 * One tick along the path. A pose that isn't clear holds the body where it is, and the
 * mantle waits for it; a wait that lasts gives up, and the body drops where it is.
 */
export function stepMantle(b: BodyState, spec: BodySpec, ctx: MotorContext): void {
  const m = b.mantle!;
  const { tuning, dt, world, solids } = ctx;
  const total = totalTime(m);
  const next = m.t + dt < total ? m.t + dt : total;
  mantleAt(m, next, pose);
  keepOnGround(world, pose);
  if (!poseClear(pose.x, pose.y, pose.z, bodyHeight(b, spec), spec, ctx)) {
    b.speed = 0;
    m.waited += dt;
    if (m.waited >= spec.mantle.holdFor) {
      b.mantle = null;
      b.motor = 'air';
    }
    return;
  }
  m.waited = 0;
  const mx = pose.x - b.x;
  const my = pose.y - b.y;
  const mz = pose.z - b.z;
  b.speed = Math.sqrt(mx * mx + mz * mz + my * my) / dt;
  b.x = pose.x;
  b.y = pose.y;
  b.z = pose.z;
  m.t = next;
  b.standingOn = -1;
  // The hands take hold as the pull begins: a sound, by what they take hold of.
  if (!m.grabbed && m.t >= m.grabAt) {
    m.grabbed = true;
    const loudness = tuning.noise.mantle.grip * surfaceLoudness(m.grip, tuning);
    const i = 6; // the top of the pull
    ctx.emit({ type: 'mantle', source: ctx.source, x: m.points[i]!, y: m.points[i + 1]!, z: m.points[i + 2]!, surface: m.grip, loudness, radius: loudness * tuning.noise.radiusPerUnit });
  }
  if (m.t < total) return;
  // --- Landed: on the ground, or on a ladder (getting on from the top). ---
  if (m.then >= 0) {
    b.ladder = { index: m.then, fromX: b.x, fromZ: b.z, t: spec.ladder.reachTime, stride: 0 };
    b.mantle = null;
    b.motor = 'ladder';
    return;
  }
  const stand = m.stand;
  const dropped = m.dropped;
  b.mantle = null;
  const g = groundBelow(world, solids, b.x, b.z, b.y + spec.stepHeight, spec.radius);
  b.y = g.height;
  b.surface = g.surface;
  b.standingOn = g.collider;
  b.slopeTan = g.collider >= 0 ? 0 : world.terrain.sample(b.x, b.z, sample).slopeTan;
  b.motor = 'ground';
  b.speed = 0;
  // Lowered down the far side, not fallen: quieter than a fall from there would be.
  if (dropped >= tuning.noise.mantle.minDrop) {
    const loudness = tuning.noise.mantle.drop * Math.min(1, dropped) * surfaceLoudness(b.surface, tuning);
    ctx.emit({ type: 'land', source: ctx.source, x: b.x, y: b.y, z: b.z, surface: b.surface, speed: Math.sqrt(2 * tuning.sim.gravity * dropped) * 0.5, loudness, radius: loudness * tuning.noise.radiusPerUnit });
  }
  if (stand) requestStance(b, 'stand', spec, ctx);
}

/** The controller overlay: the way a mantle would go from here, or the way it's going. */
export function drawMantle(d: DebugDraw, b: BodyState, spec: BodySpec, ctx: MotorContext): void {
  const m = b.mantle ?? (plan(b, spec, ctx, planned) ? planned : null);
  if (!m) return;
  const P = m.points;
  for (let i = 0; i + 5 < P.length; i += 3) d.line(P[i]!, P[i + 1]! + 0.05, P[i + 2]!, P[i + 3]!, P[i + 4]! + 0.05, P[i + 5]!, b.mantle ? 'warn' : 'good');
}
