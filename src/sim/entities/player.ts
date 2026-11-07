import type { Tuning } from '../../config/tuning';
import { dcos, dsin, dtanDeg } from '../core/detmath';
import { clamp, smoothstep, yawFromDirection } from '../core/math';
import { PLAYER_SOURCE, type SimEvent, type StanceName } from '../events';
import type { World } from '../gen/world';
import type { InputFrame } from '../input';
import { Blocks, footprintContains, pushOutCircle } from '../world/colliders';
import { makeTerrainSample } from '../world/heightfield';
import { Surface, surfaceLoudness } from '../world/surfaces';

/**
 * The first-person controller: stances, speeds, slopes, collision and footsteps.
 *
 * Numbers come from tuning.player (design doc · Player). Movement is deliberately
 * weighty: speed builds over a few tenths of a second, climbing slows you, and changing
 * into or out of prone takes three quarters of a second during which you can only crawl.
 *
 * Invariants (checked by tests/invariants.test.ts on long bot runs):
 * - the player never ends a tick inside anything solid or under the terrain;
 * - the player never climbs terrain steeper than maxSlopeDeg, or rises more than
 *   stepHeight in one tick;
 * - static geometry always beats guards: a guard can shove you, never through a wall.
 */

export type Stance = StanceName;
export type MoveMode = 'idle' | 'sprint' | 'walk' | 'crouch' | 'crawl';

export interface PlayerState {
  /** Feet position. */
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  stance: Stance;
  /** Seconds left in the current stance change, out of stanceDuration. */
  stanceTimer: number;
  stanceDuration: number;
  /** True while changing into or out of prone; only crawling is possible then. */
  proneTransition: boolean;
  /** A stance toggle pressed during a prone change, applied when it finishes. */
  queuedStance: 'crouch' | 'prone' | null;
  /** Sprint was held last tick. */
  sprintHeld: boolean;
  /** Crouched or went prone while holding sprint: don't auto-stand until sprint is released. */
  sprintSuppressed: boolean;
  /** Eye height when the current stance change began. */
  eyeFrom: number;
  eyeHeight: number;
  grounded: boolean;
  /** Distance moved since the last footstep. */
  stride: number;
  mode: MoveMode;
  /** Actual horizontal speed this tick, m/s. */
  speed: number;
  surface: Surface;
  slopeTan: number;
  /** Loudness of the current movement; 0 when still. */
  loudness: number;
  /** Collider stood on, or -1 for terrain. */
  standingOn: number;
}

export interface PlayerContext {
  world: World;
  tuning: Tuning;
  dt: number;
  tick: number;
  guards: ReadonlyArray<{ x: number; y: number; z: number }>;
  emit: (e: SimEvent) => void;
}

const GUARD_RADIUS = 0.3;
const GUARD_HEIGHT = 1.85;
/**
 * Most a guard can shove the body in one resolve pass. Small enough that a shove can
 * never carry the body's centre across even a thin fence before the static pass
 * pushes it back out.
 */
const GUARD_PUSH_MAX = 0.08;

const sample = makeTerrainSample();
const ids: number[] = [];
const push = { x: 0, z: 0 };

export function createPlayer(world: World, tuning: Tuning): PlayerState {
  const { spawn } = world;
  const y = groundBelow(world, spawn.x, spawn.z, Infinity, tuning.player.radius).height;
  return {
    x: spawn.x,
    y,
    z: spawn.z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: yawFromDirection(spawn.faceX, spawn.faceZ),
    pitch: 0,
    stance: 'stand',
    stanceTimer: 0,
    stanceDuration: 0,
    proneTransition: false,
    queuedStance: null,
    sprintHeld: false,
    sprintSuppressed: false,
    eyeFrom: tuning.player.eyeHeight.stand,
    eyeHeight: tuning.player.eyeHeight.stand,
    grounded: true,
    stride: 0,
    mode: 'idle',
    speed: 0,
    surface: world.terrain.surfaceAt(spawn.x, spawn.z),
    slopeTan: 0,
    loudness: 0,
    standingOn: -1,
  };
}

export function stepPlayer(p: PlayerState, input: InputFrame, ctx: PlayerContext): void {
  const { world, tuning, dt } = ctx;
  const T = tuning.player;

  // --- View. -------------------------------------------------------------------------
  p.yaw = input.yaw;
  p.pitch = clamp(input.pitch, -1.5, 1.5);

  // --- Stance. -----------------------------------------------------------------------
  updateStance(p, input, ctx);
  const busy = p.proneTransition;
  const wantsSprint = input.sprint && input.moveZ > 0.5 && p.stance === 'stand' && !busy;
  if (p.stanceTimer > 0) {
    p.stanceTimer = Math.max(0, p.stanceTimer - dt);
    const t = p.stanceDuration > 0 ? 1 - p.stanceTimer / p.stanceDuration : 1;
    p.eyeHeight = p.eyeFrom + (T.eyeHeight[p.stance] - p.eyeFrom) * smoothstep(0, 1, t);
    if (p.stanceTimer === 0) p.proneTransition = false;
  } else {
    p.eyeHeight = T.eyeHeight[p.stance];
  }

  // --- Wished velocity. --------------------------------------------------------------
  let mx = input.moveX;
  let mz = input.moveZ;
  const len = Math.sqrt(mx * mx + mz * mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }
  let mode: MoveMode;
  if (len < 0.05) mode = 'idle';
  else if (p.stance === 'prone' || busy) mode = 'crawl';
  else if (p.stance === 'crouch') mode = 'crouch';
  else mode = wantsSprint ? 'sprint' : 'walk';
  let speed = mode === 'idle' ? 0 : T.speed[mode];
  if (mz < 0) speed *= 1 - (1 - T.backwardFactor) * Math.min(1, -mz / Math.max(len, 1e-6));

  const sinY = dsin(p.yaw);
  const cosY = dcos(p.yaw);
  let wishX = (cosY * mx - sinY * mz) * speed;
  let wishZ = (-sinY * mx - cosY * mz) * speed;

  world.terrain.sample(p.x, p.z, sample);
  if (p.standingOn < 0 && (wishX !== 0 || wishZ !== 0)) {
    const tanMax = dtanDeg(T.maxSlopeDeg);
    const ws = Math.sqrt(wishX * wishX + wishZ * wishZ);
    const rise = (wishX * sample.gx + wishZ * sample.gz) / ws; // metres up per metre forward
    if (rise > tanMax) {
      // Too steep to climb: keep only the part of the motion that runs along the slope.
      const g2 = sample.gx * sample.gx + sample.gz * sample.gz;
      const k = (wishX * sample.gx + wishZ * sample.gz) / g2;
      wishX -= sample.gx * k;
      wishZ -= sample.gz * k;
    } else if (rise > 0) {
      const f = 1 - (1 - T.uphillSlowdown) * (rise / tanMax);
      wishX *= f;
      wishZ *= f;
    }
  }

  // --- Accelerate (no steering in the air). -----------------------------------------
  if (p.grounded) {
    const dvx = wishX - p.vx;
    const dvz = wishZ - p.vz;
    const dvl = Math.sqrt(dvx * dvx + dvz * dvz);
    if (dvl > 0) {
      const speedingUp = wishX * wishX + wishZ * wishZ > p.vx * p.vx + p.vz * p.vz;
      const rate = (speedingUp ? T.accel : T.decel) * dt;
      const k = dvl > rate ? rate / dvl : 1;
      p.vx += dvx * k;
      p.vz += dvz * k;
    }
  }

  // --- Move and collide. ------------------------------------------------------------
  const feet = p.y;
  const dest = resolveMove(p, p.x + p.vx * dt, p.z + p.vz * dt, ctx);
  const nx = dest.x;
  const nz = dest.z;

  // --- Ground and gravity. -----------------------------------------------------------
  const ground = groundBelow(world, nx, nz, feet + T.stepHeight, T.radius);
  if (p.grounded && p.vy <= 0 && feet - ground.height <= T.groundSnap) {
    p.y = ground.height;
    p.vy = 0;
    p.grounded = true;
  } else if (feet > ground.height) {
    p.vy -= T.gravity * dt;
    p.y = feet + p.vy * dt;
    if (p.y <= ground.height) {
      p.y = ground.height;
      p.vy = 0;
      p.grounded = true;
    } else {
      p.grounded = false;
    }
  } else {
    p.y = ground.height;
    p.vy = 0;
    p.grounded = true;
  }

  // --- Footsteps. --------------------------------------------------------------------
  // Noise and stride follow how fast the body actually moves, not the requested mode:
  // diving prone from a sprint is loud until you've stopped.
  const mdx = nx - p.x;
  const mdz = nz - p.z;
  const movedDist = Math.sqrt(mdx * mdx + mdz * mdz);
  p.x = nx;
  p.z = nz;
  p.speed = movedDist / dt;
  p.mode = mode;
  p.surface = ground.surface;
  p.standingOn = ground.collider;
  p.slopeTan = ground.collider >= 0 ? 0 : world.terrain.sample(nx, nz, sample).slopeTan;
  const step = gait(p.speed, tuning);
  p.loudness = p.speed < 0.05 ? 0 : step.loudness * surfaceLoudness(ground.surface, tuning);
  if (p.grounded && movedDist > 0) {
    p.stride += movedDist;
    if (p.stride >= step.stride) {
      // Keep at most one stride of carry-over so a shrinking stride never fires twice.
      p.stride = Math.min(p.stride - step.stride, step.stride);
      ctx.emit({
        type: 'footstep',
        tick: ctx.tick,
        source: PLAYER_SOURCE,
        x: p.x,
        y: p.y,
        z: p.z,
        surface: ground.surface,
        loudness: p.loudness,
        radius: p.loudness * tuning.noise.radiusPerUnit,
      });
    }
  }
}

const tmpPush = { x: 0, z: 0 };

/**
 * Moves the body toward (tx, tz) and returns where it can actually end the tick.
 *
 * Each pass resolves, in order: guards (soft, may shove you), terrain too steep to climb
 * at the destination (slide along its contour), and static colliders (hard, always win).
 * A ceiling the body is already under but no longer fits beneath (the ground rose) is
 * never pushed out of sideways. If anything still overlaps after the passes, the body
 * stays where it was. That keeps every tick's end position clear, by induction from a
 * clear spawn.
 */
function resolveMove(p: PlayerState, tx: number, tz: number, ctx: PlayerContext): { x: number; z: number } {
  const { world, tuning } = ctx;
  const T = tuning.player;
  const r = T.radius;
  const height = T.height[p.stance];
  const feet = p.y;
  const stepTop = feet + T.stepHeight;
  const tanMax = dtanDeg(T.maxSlopeDeg);
  const list = world.colliders.list;
  let nx = tx;
  let nz = tz;

  for (let iter = 0; iter < 4; iter++) {
    let moved = false;

    for (const g of ctx.guards) {
      if (g.y > feet + height || g.y + GUARD_HEIGHT < feet) continue;
      const dx = nx - g.x;
      const dz = nz - g.z;
      const rr = r + GUARD_RADIUS;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-12) {
        const d = Math.sqrt(d2);
        const k = Math.min(rr - d, GUARD_PUSH_MAX) / d;
        nx += dx * k;
        nz += dz * k;
        cancelInto(p, dx * k, dz * k);
        moved = true;
      }
    }

    if (terrainRise(world, nx, nz, feet) > riseAllowance(p, nx, nz, tanMax, T.stepHeight)) {
      // Slide along the contour of the slope at the destination.
      world.terrain.sample(nx, nz, sample);
      const g2 = sample.gx * sample.gx + sample.gz * sample.gz;
      if (g2 > 1e-12) {
        let dx = nx - p.x;
        let dz = nz - p.z;
        const k = (dx * sample.gx + dz * sample.gz) / g2;
        if (k > 0) {
          dx -= sample.gx * k;
          dz -= sample.gz * k;
          nx = p.x + dx;
          nz = p.z + dz;
          const kv = (p.vx * sample.gx + p.vz * sample.gz) / g2;
          if (kv > 0) {
            p.vx -= sample.gx * kv;
            p.vz -= sample.gz * kv;
          }
          moved = true;
        }
      }
    }

    const head = Math.max(feet, groundBelow(world, nx, nz, stepTop, r).height) + height;
    world.colliders.query(nx - r - 0.1, nz - r - 0.1, nx + r + 0.1, nz + r + 0.1, ids);
    for (let q = 0; q < ids.length; q++) {
      const c = list[ids[q]!]!;
      if ((c.flags & Blocks.Move) === 0) continue;
      if (c.y1 <= stepTop) continue; // low enough to step onto
      if (c.y0 >= head) continue; // overhead
      if (!pushOutCircle(c, nx, nz, r, push)) continue;
      // It was above our head and over us at the start, and the ground has risen: a
      // ceiling we no longer fit beneath, not a wall to slide off. Leave it to isClear.
      if (c.y0 >= feet + height && pushOutCircle(c, p.x, p.z, r, tmpPush)) continue;
      nx += push.x;
      nz += push.z;
      cancelInto(p, push.x, push.z);
      moved = true;
    }

    if (!moved) break;
  }

  const lim = world.playHalf;
  if (nx < -lim || nx > lim) {
    nx = clamp(nx, -lim, lim);
    p.vx = 0;
  }
  if (nz < -lim || nz > lim) {
    nz = clamp(nz, -lim, lim);
    p.vz = 0;
  }

  if (!isClear(p, nx, nz, ctx, tanMax)) {
    p.vx = 0;
    p.vz = 0;
    return { x: p.x, z: p.z };
  }
  return { x: nx, z: nz };
}

/** How far the terrain at (x, z) rises above the feet. */
function terrainRise(world: World, x: number, z: number, feet: number): number {
  return world.terrain.heightAt(x, z) - feet;
}

/** The most the terrain may rise over a move from the current position to (x, z). */
function riseAllowance(p: PlayerState, x: number, z: number, tanMax: number, stepHeight: number): number {
  const dx = x - p.x;
  const dz = z - p.z;
  // 2 cm of slack absorbs the kink where two triangles meet.
  return Math.min(stepHeight, tanMax * Math.sqrt(dx * dx + dz * dz) + 0.02);
}

/** True if the body can end the tick at (x, z): nothing solid inside it, no cliff under it. */
function isClear(p: PlayerState, x: number, z: number, ctx: PlayerContext, tanMax: number): boolean {
  const { world, tuning } = ctx;
  const T = tuning.player;
  const r = T.radius;
  const feet = p.y;
  const stepTop = feet + T.stepHeight;
  if (terrainRise(world, x, z, feet) > riseAllowance(p, x, z, tanMax, T.stepHeight)) return false;
  const head = Math.max(feet, groundBelow(world, x, z, stepTop, r).height) + T.height[p.stance];
  world.colliders.query(x - r, z - r, x + r, z + r, ids);
  for (let q = 0; q < ids.length; q++) {
    const c = world.colliders.list[ids[q]!]!;
    if ((c.flags & Blocks.Move) === 0 || c.y1 <= stepTop || c.y0 >= head) continue;
    if (pushOutCircle(c, x, z, r, tmpPush) && tmpPush.x * tmpPush.x + tmpPush.z * tmpPush.z > 1e-8) return false;
  }
  return true;
}

/**
 * Loudness factor and stride length for a speed, interpolated between the design doc's
 * gaits (crawl, crouch, walk, sprint) so noise always matches what the body is doing.
 */
export function gait(speed: number, tuning: Tuning): { loudness: number; stride: number } {
  const T = tuning.player;
  const N = tuning.noise.movement;
  const rows: Array<[number, number, number]> = [
    [T.speed.crawl, N.crawl, T.stride.crawl],
    [T.speed.crouch, N.crouch, T.stride.crouch],
    [T.speed.walk, N.walk, T.stride.walk],
    [T.speed.sprint, N.sprint, T.stride.sprint],
  ];
  rows.sort((a, b) => a[0] - b[0]);
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  if (speed <= first[0]) return { loudness: first[1], stride: first[2] };
  if (speed >= last[0]) return { loudness: last[1], stride: last[2] };
  for (let k = 1; k < rows.length; k++) {
    const b = rows[k]!;
    if (speed <= b[0]) {
      const a = rows[k - 1]!;
      const t = (speed - a[0]) / (b[0] - a[0]);
      return { loudness: a[1] + (b[1] - a[1]) * t, stride: a[2] + (b[2] - a[2]) * t };
    }
  }
  return { loudness: last[1], stride: last[2] };
}

/** Removes the part of the velocity pointing into a surface we were pushed out of. */
function cancelInto(p: PlayerState, px: number, pz: number): void {
  const l = Math.sqrt(px * px + pz * pz);
  if (l < 1e-9) return;
  const nx = px / l;
  const nz = pz / l;
  const vn = p.vx * nx + p.vz * nz;
  if (vn < 0) {
    p.vx -= vn * nx;
    p.vz -= vn * nz;
  }
}

/**
 * Stance toggles. A prone change can't be interrupted: toggles pressed during it are
 * queued (latest wins) and applied when it finishes. Sprinting from a crouch stands you
 * up, unless you crouched while holding sprint; then release sprint first.
 */
function updateStance(p: PlayerState, input: InputFrame, ctx: PlayerContext): void {
  if (!input.sprint) p.sprintSuppressed = false;
  p.sprintHeld = input.sprint;
  let request: 'crouch' | 'prone' | null = input.prone ? 'prone' : input.crouch ? 'crouch' : null;
  if (p.proneTransition) {
    if (request) p.queuedStance = request;
    return;
  }
  if (!request && p.queuedStance) {
    request = p.queuedStance;
    p.queuedStance = null;
  }
  if (request === 'prone') {
    changeStance(p, p.stance === 'prone' ? 'crouch' : 'prone', ctx);
    if (input.sprint) p.sprintSuppressed = true;
  } else if (request === 'crouch') {
    changeStance(p, p.stance === 'crouch' ? 'stand' : 'crouch', ctx);
    if (input.sprint && p.stance !== 'stand') p.sprintSuppressed = true;
  } else if (input.sprint && input.moveZ > 0.5 && p.stance === 'crouch' && !p.sprintSuppressed) {
    changeStance(p, 'stand', ctx);
  }
}

function changeStance(p: PlayerState, to: Stance, ctx: PlayerContext): void {
  if (to === p.stance) return;
  const T = ctx.tuning.player;
  if (T.height[to] > T.height[p.stance] && !hasHeadroom(p, T.height[to], ctx)) return;
  const prone = to === 'prone' || p.stance === 'prone';
  ctx.emit({ type: 'stance', tick: ctx.tick, from: p.stance, to });
  p.eyeFrom = p.eyeHeight;
  p.stance = to;
  p.stanceDuration = prone ? T.stanceTime.prone : T.stanceTime.crouch;
  p.stanceTimer = p.stanceDuration;
  p.proneTransition = prone;
}

function hasHeadroom(p: PlayerState, height: number, ctx: PlayerContext): boolean {
  const { colliders } = ctx.world;
  const r = ctx.tuning.player.radius;
  const current = ctx.tuning.player.height[p.stance];
  colliders.query(p.x - r, p.z - r, p.x + r, p.z + r, ids);
  for (let q = 0; q < ids.length; q++) {
    const c = colliders.list[ids[q]!]!;
    if ((c.flags & Blocks.Move) === 0) continue;
    if (c.y0 < p.y + current - 0.01 || c.y0 > p.y + height) continue;
    if (footprintContains(c, p.x, p.z, r)) return false;
  }
  return true;
}

export interface Ground {
  height: number;
  surface: Surface;
  /** Collider stood on, or -1 for terrain. */
  collider: number;
}

const groundOut: Ground = { height: 0, surface: Surface.Grass, collider: -1 };

/**
 * The terrain, or the highest collider top within reach (`maxTop`) under a body of
 * radius `radius` at (x, z). Any overlap counts: a body that overlaps a low ledge
 * stands on it. Otherwise it would stand beside the ledge while overlapping it, and a
 * small drop in the terrain would turn the ledge into a wall it is already inside.
 */
export function groundBelow(world: World, x: number, z: number, maxTop: number, radius: number): Ground {
  world.terrain.sample(x, z, sample);
  groundOut.height = sample.height;
  groundOut.surface = sample.surface;
  groundOut.collider = -1;
  const { colliders } = world;
  colliders.query(x - radius, z - radius, x + radius, z + radius, ids);
  for (let q = 0; q < ids.length; q++) {
    const c = colliders.list[ids[q]!]!;
    if ((c.flags & Blocks.Move) === 0) continue;
    if (c.y1 > maxTop || c.y1 <= groundOut.height) continue;
    if (!footprintContains(c, x, z, radius)) continue;
    groundOut.height = c.y1;
    groundOut.surface = c.surface;
    groundOut.collider = c.id;
  }
  return groundOut;
}

/**
 * How visible the player is right now, from the design doc's sight table (stance ×
 * movement, daylight, no cover). Phase 1 detection multiplies this with cone, distance,
 * cover and skyline.
 */
export function exposure(p: PlayerState, tuning: Tuning): number {
  const V = tuning.visibility;
  return V.stance[p.stance] * movementVisibility(p, tuning) * V.light.lit;
}

/** The sight table's movement factor for how fast the body is actually moving. */
export function movementVisibility(p: PlayerState, tuning: Tuning): number {
  const V = tuning.visibility;
  if (p.speed < 0.2) return V.movement.still;
  if (p.speed > tuning.player.speed.walk + 0.25) return V.movement.sprinting;
  return V.movement.moving;
}
