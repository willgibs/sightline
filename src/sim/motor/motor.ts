import type { Tuning } from '../../config/tuning';
import { dtanDeg } from '../core/detmath';
import { clamp, smoothstep } from '../core/math';
import type { EventDraft } from '../events';
import type { World } from '../gen/world';
import { Blocks, circleOverlaps, pushOutCircle } from '../world/colliders';
import { makeTerrainSample } from '../world/heightfield';
import type { Solids } from '../world/solids';
import { surfaceLoudness } from '../world/surfaces';
import { bodyHeight, groundBelow, pushHistory, type BodySpec, type BodyState, type Gait, type MotorModeName, type Stance } from './body';
import { footfall } from './footfall';
import type { DebugDraw } from '../debugDraw';
import { DEG, datan } from '../core/detmath';

/**
 * The shared motor: how any body moves. An intent says what the body wants (a velocity,
 * a gait, a facing); the motor decides what it gets, under one set of rules for slopes,
 * steps, collision, falls and footsteps. The player's intent comes from input
 * (entities/player.ts); the guards' will come from their routines and brains.
 *
 * Movement is deliberately weighty: speed builds over a few tenths of a second, climbing
 * slows you, and changing into or out of prone takes three quarters of a second during
 * which you can only crawl.
 *
 * Modes. A body is in one motor mode at a time. Each mode drives the body's velocity its
 * own way: on the ground with traction (or sliding, on ground too steep to stand on), in
 * the air not at all. Moving and settling are shared: collision, finding the ground,
 * following it or falling, landing, footsteps. Settling picks the next mode. A mode that
 * moves along a path of its own, such as lab C's mantle or ladder, replaces both.
 *
 * Invariants (tests/invariants.test.ts, tests/steep.test.ts, tests/solids.test.ts):
 * - in every mode, the body never ends a tick inside anything solid or under the terrain,
 *   and never rises more than stepHeight in one tick; solid geometry (the world's
 *   colliders and entities' shapes, world/solids.ts) always beats other bodies, which can
 *   shove it but never through a wall. Entities' shapes hold this only because whatever
 *   moves one never moves it into a body;
 * - on the ground, the body never gains height on ground steeper than maxSlopeDeg, from
 *   any angle of approach.
 * A new mode states its own invariants here and adds them to the invariant run.
 *
 * Ground steeper than maxSlopeDeg is not ground you can stand on: you can't climb it, and
 * on it you slide, the way scree or a rock face would carry you down. Walking off an edge
 * steeper than gravity can follow is a fall, and every fall or slide ends in a landing
 * that makes a sound.
 */

/** What a body wants to do this tick. */
export interface MoveIntent {
  /** The tick this intent is for. The motor treats a stale intent as standing still. */
  tick: number;
  /** Wished horizontal velocity in the world frame, m/s, before terrain: the motor applies slopes. */
  wishX: number;
  wishZ: number;
  gait: Gait;
  /** Facing and view pitch to take. */
  yaw: number;
  pitch: number;
}

export function idleIntent(b: BodyState, tick: number, out: MoveIntent): MoveIntent {
  out.tick = tick;
  out.wishX = 0;
  out.wishZ = 0;
  out.gait = 'idle';
  out.yaw = b.yaw;
  out.pitch = b.pitch;
  return out;
}

/** Another body, as the motor sees it: an upright cylinder that can shove and be shoved. */
export interface Cylinder {
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
}

export interface MotorContext {
  world: World;
  /** The world's colliders and entities' solid shapes (world/solids.ts). */
  solids: Solids;
  tuning: Tuning;
  dt: number;
  tick: number;
  /** Who this body is, for the events it makes. */
  source: number;
  /** Every other body this one can collide with. */
  others: ReadonlyArray<Cylinder>;
  emit: (e: EventDraft) => number;
  /**
   * The controller overlay (debug view only): draws this body's rim probes, slope and
   * every push of its resolve passes. Drawing only: the motor does the same with or without.
   */
  draw?: DebugDraw | null;
}

interface MotorMode {
  /** Sets this tick's velocity from the intent. */
  drive(b: BodyState, i: MoveIntent, spec: BodySpec, ctx: MotorContext, tanMax: number): void;
}

const MODES: Record<MotorModeName, MotorMode> = {
  ground: { drive: driveGround },
  air: { drive: driveAir },
};

const sample = makeTerrainSample();
const ids: number[] = [];
const push = { x: 0, z: 0 };
const tmpPush = { x: 0, z: 0 };
const dest = { x: 0, z: 0 };

/** Directions for testing the body's rim against the terrain: 12 around the circle. */
const RIM = [
  [1, 0],
  [0.8660254037844387, 0.5],
  [0.5, 0.8660254037844387],
  [0, 1],
  [-0.5, 0.8660254037844387],
  [-0.8660254037844387, 0.5],
  [-1, 0],
  [-0.8660254037844387, -0.5],
  [-0.5, -0.8660254037844387],
  [0, -1],
  [0.5, -0.8660254037844387],
  [0.8660254037844387, -0.5],
] as const;

/** Moves a body one tick toward what it intends. */
export function stepMotor(b: BodyState, i: MoveIntent, spec: BodySpec, ctx: MotorContext): void {
  const { world, tuning, dt } = ctx;
  const tanMax = dtanDeg(spec.maxSlopeDeg);

  pushHistory(b);
  b.yaw = i.yaw;
  b.pitch = clamp(i.pitch, -spec.pitchLimit, spec.pitchLimit);
  easeStance(b, spec, dt);
  MODES[b.motor].drive(b, i, spec, ctx, tanMax);

  // --- Move and collide. ------------------------------------------------------------
  const feet = b.y;
  resolveMove(b, b.x + b.vx * dt, b.z + b.vz * dt, spec, ctx, dest);
  const nx = dest.x;
  const nz = dest.z;
  const mdx = nx - b.x;
  const mdz = nz - b.z;
  const movedDist = Math.sqrt(mdx * mdx + mdz * mdz);

  // --- Settle: follow the ground, fall or land. ----------------------------------
  const ground = groundBelow(world, ctx.solids, nx, nz, feet + spec.stepHeight, spec.radius);
  const destSlope = ground.collider >= 0 ? 0 : world.terrain.sample(nx, nz, sample).slopeTan;
  const drop = feet - ground.height;
  const wasFalling = b.motor !== 'ground' || b.sliding;
  const fallSpeed = -b.vy;
  // How far the ground may fall away and still be followed: on walkable ground, a step
  // down (groundSnap); on ground too steep to stand on, only as far as gravity could
  // carry the body this tick. Steeper than that, and the body leaves the ground.
  const follow =
    destSlope > tanMax ? Math.max(0, -b.vy) * dt + 0.5 * tuning.sim.gravity * dt * dt + 0.005 : tanMax * movedDist + spec.groundSnap;
  let landed = false;
  /** Speed at the moment of touching down from a fall, m/s. */
  let contact = 0;
  if (b.motor === 'ground' && b.vy <= 0 && drop <= follow) {
    b.y = ground.height;
    // Sliding keeps its descent rate, so gravity keeps building it; walkable ground stops it.
    b.vy = destSlope > tanMax ? -drop / dt : 0;
    b.motor = 'ground';
    landed = b.sliding && destSlope <= tanMax;
  } else if (feet > ground.height) {
    // Exact under constant gravity, so a fall from h takes √(2h/g) and lands at √(2gh)
    // at any tick rate; the speed at touchdown is the speed when the ground is reached
    // within the tick, not at its start.
    const g = tuning.sim.gravity;
    const v0 = b.vy;
    b.vy = v0 - g * dt;
    b.y = feet + v0 * dt - 0.5 * g * dt * dt;
    if (b.y <= ground.height) {
      contact = Math.sqrt(Math.max(0, v0 * v0 + 2 * g * (feet - ground.height)));
      b.y = ground.height;
      landed = true;
      b.vy = destSlope > tanMax ? b.vy : 0;
      b.motor = 'ground';
    } else {
      b.motor = 'air';
    }
  } else {
    b.y = ground.height;
    landed = wasFalling && destSlope <= tanMax;
    b.vy = 0;
    b.motor = 'ground';
  }
  const impact = landed ? Math.max(fallSpeed, -b.vy, contact) : 0;
  if (landed && destSlope <= tanMax) b.vy = 0;

  // --- Footsteps. --------------------------------------------------------------------
  // Noise and stride follow how fast the body actually moves, not the requested gait:
  // diving prone from a sprint is loud until you've stopped. Shoves from others move the
  // body but aren't steps.
  b.x = nx;
  b.z = nz;
  b.speed = movedDist / dt;
  b.gait = i.gait;
  b.surface = ground.surface;
  b.standingOn = ground.collider;
  b.slopeTan = destSlope;
  const step = footfall(b.speed, spec, tuning.noise);
  b.loudness = b.speed < 0.05 ? 0 : step.loudness * surfaceLoudness(ground.surface, tuning);
  // Steps are what the legs did: the body's own speed over the tick, never more than it
  // actually moved. Another body shoving a still one moves it without a single step.
  const walked = Math.min(movedDist, Math.sqrt(b.vx * b.vx + b.vz * b.vz) * dt);
  if (b.motor === 'ground' && !b.sliding && walked > 0 && b.loudness > 0) {
    b.stride += walked;
    if (b.stride >= step.stride) {
      // Keep less than a stride of carry-over, so a sudden slow-down never fires twice.
      b.stride = Math.min(b.stride - step.stride, 0.5 * step.stride);
      ctx.emit({
        type: 'footstep',
        source: ctx.source,
        x: b.x,
        y: b.y,
        z: b.z,
        surface: ground.surface,
        loudness: b.loudness,
        radius: b.loudness * tuning.noise.radiusPerUnit,
        gait: soundGait(b, spec),
      });
    }
  }
  const L = tuning.noise.landing;
  if (impact >= L.minSpeed) {
    const loudness = Math.min(L.max, impact * L.perSpeed) * surfaceLoudness(ground.surface, tuning);
    ctx.emit({
      type: 'land',
      source: ctx.source,
      x: b.x,
      y: b.y,
      z: b.z,
      surface: ground.surface,
      speed: impact,
      loudness,
      radius: loudness * tuning.noise.radiusPerUnit,
    });
    b.stride = 0;
  }
  if (ctx.draw) drawController(ctx.draw, b, spec, world, tanMax);
}

/**
 * The controller overlay: the body's circle, its rim probes (red where the terrain
 * inside the rim rises more than a step), where it is heading, and a label with the
 * slope against the limit, sliding, what it stands on and its motor mode.
 */
function drawController(d: DebugDraw, b: BodyState, spec: BodySpec, world: World, tanMax: number): void {
  const r = spec.radius;
  const y = b.y + 0.04;
  d.circle(b.x, y, b.z, r, b.sliding ? 'bad' : 'info');
  for (let k = 0; k < RIM.length; k++) {
    const px = b.x + RIM[k]![0] * r;
    const pz = b.z + RIM[k]![1] * r;
    const h = world.terrain.heightAt(px, pz);
    d.point(px, h + 0.04, pz, 0.08, h - b.y > spec.stepHeight ? 'bad' : 'good');
  }
  if (b.speed > 0.05) d.line(b.x, y, b.z, b.x + b.vx * 0.5, y, b.z + b.vz * 0.5, 'info');
  const slope = datan(b.slopeTan) / DEG;
  const tone = b.sliding ? 'bad' : b.slopeTan > tanMax * 0.8 ? 'warn' : 'muted';
  const on = b.standingOn >= 0 ? ' · on an object' : '';
  d.label(b.x, b.y + bodyHeight(b, spec) + 0.35, b.z, `slope ${slope.toFixed(0)}° of ${spec.maxSlopeDeg}°${b.sliding ? ' · sliding' : ''}${on} · ${b.motor}`, tone);
}

/**
 * What the legs are doing, for the sound of a step: the gait the body moves in, or, while
 * it coasts to a stop with no gait asked for, what its stance and speed say. Loudness
 * says how hard the step is; this says what kind of step it is, so a slow walk uphill
 * still sounds like walking.
 */
function soundGait(b: BodyState, spec: BodySpec): Exclude<Gait, 'idle'> {
  if (b.gait !== 'idle') return b.gait;
  if (b.stance === 'prone') return 'crawl';
  if (b.stance === 'crouch') return 'crouch';
  return b.speed > spec.speed.walk + 0.25 ? 'sprint' : 'walk';
}

/** The eye eases toward the stance's height; a prone change ends when its timer does. */
function easeStance(b: BodyState, spec: BodySpec, dt: number): void {
  if (b.stanceTimer > 0) {
    b.stanceTimer = Math.max(0, b.stanceTimer - dt);
    const t = b.stanceDuration > 0 ? 1 - b.stanceTimer / b.stanceDuration : 1;
    b.eyeHeight = b.eyeFrom + (spec.eyeHeight[b.stance] - b.eyeFrom) * smoothstep(0, 1, t);
    if (b.stanceTimer === 0) b.proneTransition = false;
  } else {
    b.eyeHeight = spec.eyeHeight[b.stance];
    b.proneTransition = false;
  }
}

/**
 * On the ground: speed builds toward the wish, which slopes bend. Uphill slows the body,
 * and on ground too steep to stand on no part of the wish may go uphill, whatever the
 * angle; there the body has no traction and slides down instead.
 */
function driveGround(b: BodyState, i: MoveIntent, spec: BodySpec, ctx: MotorContext, tanMax: number): void {
  const dt = ctx.dt;
  let wishX = i.wishX;
  let wishZ = i.wishZ;
  ctx.world.terrain.sample(b.x, b.z, sample);
  if (b.standingOn < 0 && (wishX !== 0 || wishZ !== 0)) {
    const up = wishX * sample.gx + wishZ * sample.gz; // metres up per second, along the wish
    if (sample.slopeTan > tanMax) {
      if (up > 0) {
        const k = up / (sample.slopeTan * sample.slopeTan);
        wishX -= sample.gx * k;
        wishZ -= sample.gz * k;
      }
    } else if (up > 0) {
      const ws = Math.sqrt(wishX * wishX + wishZ * wishZ);
      const f = 1 - (1 - spec.uphillSlowdown) * (up / ws / tanMax);
      wishX *= f;
      wishZ *= f;
    }
  }

  b.sliding = b.standingOn < 0 && sample.slopeTan > tanMax;
  if (b.sliding) {
    // Gravity along the slope, projected onto the ground plane: g·sinθ·cosθ downhill.
    const s = sample.slopeTan;
    const a = (ctx.tuning.sim.gravity * s) / (1 + s * s);
    b.vx -= (sample.gx / s) * a * dt;
    b.vz -= (sample.gz / s) * a * dt;
  } else {
    const dvx = wishX - b.vx;
    const dvz = wishZ - b.vz;
    const dvl = Math.sqrt(dvx * dvx + dvz * dvz);
    if (dvl > 0) {
      const speedingUp = wishX * wishX + wishZ * wishZ > b.vx * b.vx + b.vz * b.vz;
      const rate = (speedingUp ? spec.accel : spec.decel) * dt;
      const k = dvl > rate ? rate / dvl : 1;
      b.vx += dvx * k;
      b.vz += dvz * k;
    }
  }
}

/** In the air there is nothing to push against: the body keeps its velocity and falls. */
function driveAir(b: BodyState): void {
  b.sliding = false;
}

/**
 * Starts a stance change, if the body can make it: standing up needs headroom. A change
 * into or out of prone takes stanceTime.prone and can't be interrupted (`proneTransition`).
 * Returns whether the stance changed.
 */
export function requestStance(b: BodyState, to: Stance, spec: BodySpec, ctx: Pick<MotorContext, 'solids' | 'source' | 'emit'>): boolean {
  if (to === b.stance) return false;
  if (spec.height[to] > spec.height[b.stance] && !hasHeadroom(b, spec.height[to], spec, ctx.solids)) return false;
  const prone = to === 'prone' || b.stance === 'prone';
  ctx.emit({ type: 'stance', source: ctx.source, from: b.stance, to });
  b.eyeFrom = b.eyeHeight;
  b.stance = to;
  b.stanceDuration = prone ? spec.stanceTime.prone : spec.stanceTime.crouch;
  b.stanceTimer = b.stanceDuration;
  // An instant change (a zero stance time) has no transition to wait out.
  b.proneTransition = prone && b.stanceDuration > 0;
  return true;
}

/** True if nothing solid sits between the body's current top and `height` above its feet. */
function hasHeadroom(b: BodyState, height: number, spec: BodySpec, solids: Solids): boolean {
  const r = spec.radius;
  const current = bodyHeight(b, spec);
  solids.query(b.x - r, b.z - r, b.x + r, b.z + r, ids);
  for (let q = 0; q < ids.length; q++) {
    const c = solids.get(ids[q]!);
    if ((c.flags & Blocks.Move) === 0) continue;
    // Same comparisons as moving: a slab exactly at head height is overhead, not in the way.
    if (c.y0 < b.y + current - 0.01 || c.y0 >= b.y + height) continue;
    if (circleOverlaps(c, b.x, b.z, r)) return false;
  }
  return true;
}

/**
 * Moves the body toward (tx, tz) and writes where it can actually end the tick to `out`.
 *
 * Each pass resolves, in order: other bodies (soft, may shove), terrain (no gaining
 * height on ground too steep to stand on, and no rising faster than a walkable slope
 * allows), and colliders, the world's and entities' (hard, always win). A ceiling the body is deep under but
 * no longer fits beneath (the ground rose) is never pushed out of sideways; a shallow
 * overlap at its edge is. If anything still overlaps after the passes, the body stays
 * where it was. That keeps every tick's end position clear, by induction from a clear
 * spawn.
 */
export function resolveMove(b: BodyState, tx: number, tz: number, spec: BodySpec, ctx: MotorContext, out: { x: number; z: number }): void {
  const { world, solids } = ctx;
  const r = spec.radius;
  const height = bodyHeight(b, spec);
  const feet = b.y;
  const stepTop = feet + spec.stepHeight;
  const tanMax = dtanDeg(spec.maxSlopeDeg);
  let nx = tx;
  let nz = tz;

  for (let iter = 0; iter < 4; iter++) {
    let moved = false;

    for (const o of ctx.others) {
      if (o.y > feet + height || o.y + o.height < feet) continue;
      const dx = nx - o.x;
      const dz = nz - o.z;
      const rr = r + o.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-12) {
        const d = Math.sqrt(d2);
        const k = Math.min(rr - d, spec.shoveMax) / d;
        ctx.draw?.line(nx, feet + 0.1, nz, nx + dx * k, feet + 0.1, nz + dz * k, 'warn');
        nx += dx * k;
        nz += dz * k;
        cancelInto(b, dx * k, dz * k);
        moved = true;
      }
    }

    if (terrainBlocks(world, b, nx, nz, feet, tanMax, spec.stepHeight)) {
      // Slide along the contour of the slope at the destination: keep no uphill part.
      world.terrain.sample(nx, nz, sample);
      const g2 = sample.gx * sample.gx + sample.gz * sample.gz;
      if (g2 > 1e-12) {
        let dx = nx - b.x;
        let dz = nz - b.z;
        const k = (dx * sample.gx + dz * sample.gz) / g2;
        if (k > 0) {
          dx -= sample.gx * k;
          dz -= sample.gz * k;
          ctx.draw?.line(nx, feet + 0.1, nz, b.x + dx, feet + 0.1, b.z + dz, 'info');
          nx = b.x + dx;
          nz = b.z + dz;
          const kv = (b.vx * sample.gx + b.vz * sample.gz) / g2;
          if (kv > 0) {
            b.vx -= sample.gx * kv;
            b.vz -= sample.gz * kv;
          }
          moved = true;
        }
      }
    }

    if (rimPush(world, nx, nz, feet, r, spec.stepHeight, push)) {
      // Terrain rising too high inside the body's circle (the foot of a steep face): back off.
      ctx.draw?.line(nx, feet + 0.1, nz, nx + push.x, feet + 0.1, nz + push.z, 'bad');
      nx += push.x;
      nz += push.z;
      cancelInto(b, push.x, push.z);
      moved = true;
    }

    const head = Math.max(feet, groundBelow(world, solids, nx, nz, stepTop, r).height) + height;
    solids.query(nx - r - 0.1, nz - r - 0.1, nx + r + 0.1, nz + r + 0.1, ids);
    for (let q = 0; q < ids.length; q++) {
      const c = solids.get(ids[q]!);
      if ((c.flags & Blocks.Move) === 0) continue;
      if (c.y1 <= stepTop) continue; // low enough to step onto
      if (c.y0 >= head) continue; // overhead
      if (!pushOutCircle(c, nx, nz, r, push)) continue;
      // It was above our head and over us at the start, and the ground has risen: a
      // ceiling we no longer fit beneath. If the body's centre is under it, that's not a
      // wall to slide off (pushing out could throw the body metres): leave it to isClear.
      // If only the rim is under its edge, slide out like from a wall.
      if (c.y0 >= feet + height && pushOutCircle(c, b.x, b.z, r, tmpPush)) {
        const depth = Math.sqrt(push.x * push.x + push.z * push.z);
        if (depth > r) continue;
      }
      if (push.x * push.x + push.z * push.z < 1e-18) continue; // float dust, not a contact
      ctx.draw?.line(nx, feet + 0.1, nz, nx + push.x, feet + 0.1, nz + push.z, 'muted');
      nx += push.x;
      nz += push.z;
      cancelInto(b, push.x, push.z);
      moved = true;
    }

    if (!moved) break;
  }

  const lim = world.playHalf;
  if (nx < -lim || nx > lim) {
    nx = clamp(nx, -lim, lim);
    b.vx = 0;
  }
  if (nz < -lim || nz > lim) {
    nz = clamp(nz, -lim, lim);
    b.vz = 0;
  }

  if (!isClear(b, nx, nz, spec, world, solids, tanMax)) {
    b.vx = 0;
    b.vz = 0;
    out.x = b.x;
    out.z = b.z;
    return;
  }
  out.x = nx;
  out.z = nz;
}

/**
 * True if ending at (x, z) would gain height the terrain doesn't allow: climbing onto
 * ground too steep to stand on (from any angle), or rising faster than a walkable slope
 * over this move.
 */
function terrainBlocks(world: World, b: BodyState, x: number, z: number, feet: number, tanMax: number, stepHeight: number): boolean {
  world.terrain.sample(x, z, sample);
  const rise = sample.height - feet;
  if (sample.slopeTan > tanMax && rise > 0.002) return true;
  const dx = x - b.x;
  const dz = z - b.z;
  // 2 cm of slack absorbs the kink where two walkable triangles meet.
  return rise > Math.min(stepHeight, tanMax * Math.sqrt(dx * dx + dz * dz) + 0.02);
}

/**
 * The body is a circle, not a point: terrain rising more than a step inside its rim (the
 * foot of a steep face) pushes it back, so the face stays outside the body and away from
 * the camera. Writes the correction into `out`; returns false if the rim is clear.
 */
function rimPush(world: World, x: number, z: number, feet: number, r: number, stepHeight: number, out: { x: number; z: number }): boolean {
  let px = 0;
  let pz = 0;
  for (let k = 0; k < RIM.length; k++) {
    const ux = RIM[k]![0];
    const uz = RIM[k]![1];
    const excess = world.terrain.heightAt(x + ux * r, z + uz * r) - (feet + stepHeight);
    if (excess <= 0) continue;
    world.terrain.sample(x + ux * r, z + uz * r, sample);
    // Back off along the downhill direction far enough to drop the rim point below a step.
    const s = Math.max(sample.slopeTan, 1e-6);
    const back = Math.min(r, excess / s + 1e-4);
    px -= (sample.gx / s) * back;
    pz -= (sample.gz / s) * back;
  }
  const l2 = px * px + pz * pz;
  if (l2 < 1e-16) return false;
  const l = Math.sqrt(l2);
  const cap = Math.min(l, r) / l;
  out.x = px * cap;
  out.z = pz * cap;
  return true;
}

/** How far the terrain inside the body's rim rises above a step, at most; 0 or less if clear. */
function rimExcess(world: World, x: number, z: number, feet: number, r: number, stepHeight: number): number {
  let worst = -Infinity;
  for (let k = 0; k < RIM.length; k++) {
    const e = world.terrain.heightAt(x + RIM[k]![0] * r, z + RIM[k]![1] * r) - (feet + stepHeight);
    if (e > worst) worst = e;
  }
  return worst;
}

/** True if the body can end the tick at (x, z): nothing solid inside it, no cliff under it. */
function isClear(b: BodyState, x: number, z: number, spec: BodySpec, world: World, solids: Solids, tanMax: number): boolean {
  const r = spec.radius;
  const feet = b.y;
  const stepTop = feet + spec.stepHeight;
  if (terrainBlocks(world, b, x, z, feet, tanMax, spec.stepHeight)) return false;
  // Never press further into a face than the body already is. (A body falling or sliding
  // beside a face is already overlapping it with its rim; moving away or along is fine.)
  if (rimExcess(world, x, z, feet, r, spec.stepHeight) > Math.max(0, rimExcess(world, b.x, b.z, feet, r, spec.stepHeight)) + 1e-3) return false;
  const head = Math.max(feet, groundBelow(world, solids, x, z, stepTop, r).height) + bodyHeight(b, spec);
  solids.query(x - r, z - r, x + r, z + r, ids);
  for (let q = 0; q < ids.length; q++) {
    const c = solids.get(ids[q]!);
    if ((c.flags & Blocks.Move) === 0 || c.y1 <= stepTop || c.y0 >= head) continue;
    if (pushOutCircle(c, x, z, r, tmpPush) && tmpPush.x * tmpPush.x + tmpPush.z * tmpPush.z > 1e-8) return false;
  }
  return true;
}

/** Removes the part of the velocity pointing into a surface we were pushed out of. */
function cancelInto(b: BodyState, px: number, pz: number): void {
  const l = Math.sqrt(px * px + pz * pz);
  if (l < 1e-9) return;
  const nx = px / l;
  const nz = pz / l;
  const vn = b.vx * nx + b.vz * nz;
  if (vn < 0) {
    b.vx -= vn * nx;
    b.vz -= vn * nz;
  }
}
