import type { Tuning } from '../../config/tuning';
import { dcos, dsin, dtanDeg } from '../core/detmath';
import { clamp, smoothstep, yawFromDirection } from '../core/math';
import { PLAYER_SOURCE, type SimEvent, type StanceName } from '../events';
import type { World } from '../gen/world';
import type { InputFrame } from '../input';
import { Blocks, circleOverlaps, pushOutCircle } from '../world/colliders';
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
 * - the player never gains height on ground steeper than maxSlopeDeg, from any angle of
 *   approach, and never rises more than stepHeight in one tick;
 * - static geometry always beats guards: a guard can shove you, never through a wall.
 *
 * Ground steeper than maxSlopeDeg is not ground you can stand on: you can't climb it, and
 * on it you slide, the way scree or a rock face would carry you down. Walking off an edge
 * steeper than gravity can follow is a fall, and every fall or slide ends in a landing
 * that makes a sound.
 */

export type Stance = StanceName;
export type MoveMode = 'idle' | 'sprint' | 'walk' | 'crouch' | 'crawl';

export interface PlayerState {
  /** Feet position. */
  x: number;
  y: number;
  z: number;
  vx: number;
  /** Vertical speed: falling, or the descent rate while sliding on steep ground. */
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  /** The stance asked for. During a change the body is between stances; see bodyHeight. */
  stance: Stance;
  /** Seconds left in the current stance change, out of stanceDuration. */
  stanceTimer: number;
  stanceDuration: number;
  /** True while changing into or out of prone; only crawling is possible then. */
  proneTransition: boolean;
  /** A stance toggle pressed during a prone change, applied when it finishes. */
  queuedStance: 'crouch' | 'prone' | null;
  /** Crouched or went prone while holding sprint: don't auto-stand until sprint is released. */
  sprintSuppressed: boolean;
  /** Eye height when the current stance change began. */
  eyeFrom: number;
  eyeHeight: number;
  grounded: boolean;
  /** On terrain too steep to stand on: no traction, sliding down. */
  sliding: boolean;
  /** Distance walked since the last footstep (shoves from guards don't count). */
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

const sample = makeTerrainSample();
const ids: number[] = [];
const push = { x: 0, z: 0 };
const tmpPush = { x: 0, z: 0 };

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

export function createPlayer(world: World, tuning: Tuning): PlayerState {
  const { spawn } = world;
  const T = tuning.player;
  // Stand where a body walking up to the spawn point would: on the terrain or anything low
  // enough to step onto. Only if that would be inside something solid, stand on top of it.
  const terrainY = world.terrain.heightAt(spawn.x, spawn.z);
  let y = groundBelow(world, spawn.x, spawn.z, terrainY + T.stepHeight, T.radius).height;
  if (solidAround(world, spawn.x, spawn.z, y + T.stepHeight, y + T.height.stand, T.radius)) {
    y = groundBelow(world, spawn.x, spawn.z, Infinity, T.radius).height;
  }
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
    sprintSuppressed: false,
    eyeFrom: T.eyeHeight.stand,
    eyeHeight: T.eyeHeight.stand,
    grounded: true,
    sliding: false,
    stride: 0,
    mode: 'idle',
    speed: 0,
    surface: world.terrain.surfaceAt(spawn.x, spawn.z),
    slopeTan: 0,
    loudness: 0,
    standingOn: -1,
  };
}

/** True if a solid collider overlaps the vertical band [y0, y1) of a body at (x, z). */
function solidAround(world: World, x: number, z: number, y0: number, y1: number, r: number): boolean {
  world.colliders.query(x - r, z - r, x + r, z + r, ids);
  for (let q = 0; q < ids.length; q++) {
    const c = world.colliders.list[ids[q]!]!;
    if ((c.flags & Blocks.Move) !== 0 && c.y1 > y0 && c.y0 < y1 && circleOverlaps(c, x, z, r)) return true;
  }
  return false;
}

/**
 * How tall the body actually is. During a stance change the eye eases toward the new
 * height while the stance already names the target, so the body is as tall as its eye
 * plus the target stance's head clearance, and never shorter than the target. Collision,
 * headroom and sight all use this, so the body can't slip under a slab its eye is above.
 */
export function bodyHeight(p: PlayerState, tuning: Tuning): number {
  const T = tuning.player;
  return Math.max(T.height[p.stance], p.eyeHeight + (T.height[p.stance] - T.eyeHeight[p.stance]));
}

export function stepPlayer(p: PlayerState, input: InputFrame, ctx: PlayerContext): void {
  const { world, tuning, dt } = ctx;
  const T = tuning.player;
  const tanMax = dtanDeg(T.maxSlopeDeg);

  // --- View. -------------------------------------------------------------------------
  p.yaw = input.yaw;
  p.pitch = clamp(input.pitch, -T.pitchLimit, T.pitchLimit);

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
    p.proneTransition = false;
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
  // The backward share of the (already normalized) direction slows you, up to backwardFactor.
  if (mz < 0) speed *= 1 - (1 - T.backwardFactor) * Math.min(1, -mz / Math.max(Math.min(len, 1), 1e-6));

  const sinY = dsin(p.yaw);
  const cosY = dcos(p.yaw);
  let wishX = (cosY * mx - sinY * mz) * speed;
  let wishZ = (-sinY * mx - cosY * mz) * speed;

  world.terrain.sample(p.x, p.z, sample);
  if (p.standingOn < 0 && (wishX !== 0 || wishZ !== 0)) {
    const up = wishX * sample.gx + wishZ * sample.gz; // metres up per second, along the wish
    if (sample.slopeTan > tanMax) {
      // Too steep to stand on: no part of the wish may go uphill, whatever the angle.
      if (up > 0) {
        const k = up / (sample.slopeTan * sample.slopeTan);
        wishX -= sample.gx * k;
        wishZ -= sample.gz * k;
      }
    } else if (up > 0) {
      const ws = Math.sqrt(wishX * wishX + wishZ * wishZ);
      const f = 1 - (1 - T.uphillSlowdown) * (up / ws / tanMax);
      wishX *= f;
      wishZ *= f;
    }
  }

  // --- Accelerate (no steering in the air; no traction on steep ground). -----------
  p.sliding = p.grounded && p.standingOn < 0 && sample.slopeTan > tanMax;
  if (p.sliding) {
    // Gravity along the slope, projected onto the ground plane: g·sinθ·cosθ downhill.
    const s = sample.slopeTan;
    const a = (T.gravity * s) / (1 + s * s);
    p.vx -= (sample.gx / s) * a * dt;
    p.vz -= (sample.gz / s) * a * dt;
  } else if (p.grounded) {
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
  const mdx = nx - p.x;
  const mdz = nz - p.z;
  const movedDist = Math.sqrt(mdx * mdx + mdz * mdz);

  // --- Ground and gravity. -----------------------------------------------------------
  const ground = groundBelow(world, nx, nz, feet + T.stepHeight, T.radius);
  const destSlope = ground.collider >= 0 ? 0 : world.terrain.sample(nx, nz, sample).slopeTan;
  const drop = feet - ground.height;
  const wasFalling = !p.grounded || p.sliding;
  const fallSpeed = -p.vy;
  // How far the ground may fall away and still be followed: on walkable ground, a step
  // down (groundSnap); on ground too steep to stand on, only as far as gravity could
  // carry the body this tick. Steeper than that, and the body leaves the ground.
  const follow =
    destSlope > tanMax ? Math.max(0, -p.vy) * dt + 0.5 * T.gravity * dt * dt + 0.005 : tanMax * movedDist + T.groundSnap;
  let landed = false;
  if (p.grounded && p.vy <= 0 && drop <= follow) {
    p.y = ground.height;
    // Sliding keeps its descent rate, so gravity keeps building it; walkable ground stops it.
    p.vy = destSlope > tanMax ? -drop / dt : 0;
    p.grounded = true;
    landed = p.sliding && destSlope <= tanMax;
  } else if (feet > ground.height) {
    p.vy -= T.gravity * dt;
    p.y = feet + p.vy * dt;
    if (p.y <= ground.height) {
      p.y = ground.height;
      landed = true;
      p.vy = destSlope > tanMax ? p.vy : 0;
      p.grounded = true;
    } else {
      p.grounded = false;
    }
  } else {
    p.y = ground.height;
    landed = wasFalling && destSlope <= tanMax;
    p.vy = 0;
    p.grounded = true;
  }
  const impact = landed ? Math.max(fallSpeed, -p.vy) : 0;
  if (landed && destSlope <= tanMax) p.vy = 0;

  // --- Footsteps. --------------------------------------------------------------------
  // Noise and stride follow how fast the body actually moves, not the requested mode:
  // diving prone from a sprint is loud until you've stopped. Shoves from guards move the
  // body but aren't steps.
  p.x = nx;
  p.z = nz;
  p.speed = movedDist / dt;
  p.mode = mode;
  p.surface = ground.surface;
  p.standingOn = ground.collider;
  p.slopeTan = destSlope;
  const step = gait(p.speed, tuning);
  p.loudness = p.speed < 0.05 ? 0 : step.loudness * surfaceLoudness(ground.surface, tuning);
  // Steps are what the legs did: the body's own speed over the tick, never more than it
  // actually moved. A guard shoving a still body moves it without a single step.
  const walked = Math.min(movedDist, Math.sqrt(p.vx * p.vx + p.vz * p.vz) * dt);
  if (p.grounded && !p.sliding && walked > 0 && p.loudness > 0) {
    p.stride += walked;
    if (p.stride >= step.stride) {
      // Keep less than a stride of carry-over, so a sudden slow-down never fires twice.
      p.stride = Math.min(p.stride - step.stride, 0.5 * step.stride);
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
  const L = tuning.noise.landing;
  if (impact >= L.minSpeed) {
    const loudness = Math.min(L.max, impact * L.perSpeed) * surfaceLoudness(ground.surface, tuning);
    ctx.emit({
      type: 'land',
      tick: ctx.tick,
      source: PLAYER_SOURCE,
      x: p.x,
      y: p.y,
      z: p.z,
      surface: ground.surface,
      speed: impact,
      loudness,
      radius: loudness * tuning.noise.radiusPerUnit,
    });
    p.stride = 0;
  }
}

/**
 * Moves the body toward (tx, tz) and returns where it can actually end the tick.
 *
 * Each pass resolves, in order: guards (soft, may shove you), terrain (no gaining height
 * on ground too steep to stand on, and no rising faster than a walkable slope allows),
 * and static colliders (hard, always win). A ceiling the body is deep under but no
 * longer fits beneath (the ground rose) is never pushed out of sideways; a shallow
 * overlap at its edge is. If anything still overlaps after the passes, the body stays
 * where it was. That keeps every tick's end position clear, by induction from a clear
 * spawn.
 */
function resolveMove(p: PlayerState, tx: number, tz: number, ctx: PlayerContext): { x: number; z: number } {
  const { world, tuning } = ctx;
  const T = tuning.player;
  const G = tuning.guards;
  const r = T.radius;
  const height = bodyHeight(p, tuning);
  const feet = p.y;
  const stepTop = feet + T.stepHeight;
  const tanMax = dtanDeg(T.maxSlopeDeg);
  const list = world.colliders.list;
  let nx = tx;
  let nz = tz;

  for (let iter = 0; iter < 4; iter++) {
    let moved = false;

    for (const g of ctx.guards) {
      if (g.y > feet + height || g.y + G.height < feet) continue;
      const dx = nx - g.x;
      const dz = nz - g.z;
      const rr = r + G.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-12) {
        const d = Math.sqrt(d2);
        const k = Math.min(rr - d, T.shoveMax) / d;
        nx += dx * k;
        nz += dz * k;
        cancelInto(p, dx * k, dz * k);
        moved = true;
      }
    }

    if (terrainBlocks(world, p, nx, nz, feet, tanMax, T.stepHeight)) {
      // Slide along the contour of the slope at the destination: keep no uphill part.
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

    if (rimPush(world, nx, nz, feet, r, T.stepHeight, push)) {
      // Terrain rising too high inside the body's circle (the foot of a steep face): back off.
      nx += push.x;
      nz += push.z;
      cancelInto(p, push.x, push.z);
      moved = true;
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
      // ceiling we no longer fit beneath. If the body's centre is under it, that's not a
      // wall to slide off (pushing out could throw the body metres): leave it to isClear.
      // If only the rim is under its edge, slide out like from a wall.
      if (c.y0 >= feet + height && pushOutCircle(c, p.x, p.z, r, tmpPush)) {
        const depth = Math.sqrt(push.x * push.x + push.z * push.z);
        if (depth > r) continue;
      }
      if (push.x * push.x + push.z * push.z < 1e-18) continue; // float dust, not a contact
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

/**
 * True if ending at (x, z) would gain height the terrain doesn't allow: climbing onto
 * ground too steep to stand on (from any angle), or rising faster than a walkable slope
 * over this move.
 */
function terrainBlocks(world: World, p: PlayerState, x: number, z: number, feet: number, tanMax: number, stepHeight: number): boolean {
  world.terrain.sample(x, z, sample);
  const rise = sample.height - feet;
  if (sample.slopeTan > tanMax && rise > 0.002) return true;
  const dx = x - p.x;
  const dz = z - p.z;
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
  for (const [ux, uz] of RIM) {
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
  for (const [ux, uz] of RIM) {
    const e = world.terrain.heightAt(x + ux * r, z + uz * r) - (feet + stepHeight);
    if (e > worst) worst = e;
  }
  return worst;
}

/** True if the body can end the tick at (x, z): nothing solid inside it, no cliff under it. */
function isClear(p: PlayerState, x: number, z: number, ctx: PlayerContext, tanMax: number): boolean {
  const { world, tuning } = ctx;
  const T = tuning.player;
  const r = T.radius;
  const feet = p.y;
  const stepTop = feet + T.stepHeight;
  if (terrainBlocks(world, p, x, z, feet, tanMax, T.stepHeight)) return false;
  // Never press further into a face than the body already is. (A body falling or sliding
  // beside a face is already overlapping it with its rim; moving away or along is fine.)
  if (rimExcess(world, x, z, feet, r, T.stepHeight) > Math.max(0, rimExcess(world, p.x, p.z, feet, r, T.stepHeight)) + 1e-3) return false;
  const head = Math.max(feet, groundBelow(world, x, z, stepTop, r).height) + bodyHeight(p, tuning);
  world.colliders.query(x - r, z - r, x + r, z + r, ids);
  for (let q = 0; q < ids.length; q++) {
    const c = world.colliders.list[ids[q]!]!;
    if ((c.flags & Blocks.Move) === 0 || c.y1 <= stepTop || c.y0 >= head) continue;
    if (pushOutCircle(c, x, z, r, tmpPush) && tmpPush.x * tmpPush.x + tmpPush.z * tmpPush.z > 1e-8) return false;
  }
  return true;
}

type GaitRow = readonly [speed: number, loudness: number, stride: number];
/** The gait table for each tuning object, built once (tuning is replaced, never mutated). */
const gaitTables = new WeakMap<Tuning, readonly GaitRow[]>();

function gaitTable(tuning: Tuning): readonly GaitRow[] {
  let rows = gaitTables.get(tuning);
  if (!rows) {
    const T = tuning.player;
    const N = tuning.noise.movement;
    const list: GaitRow[] = [
      [T.speed.crawl, N.crawl, T.stride.crawl],
      [T.speed.crouch, N.crouch, T.stride.crouch],
      [T.speed.walk, N.walk, T.stride.walk],
      [T.speed.sprint, N.sprint, T.stride.sprint],
    ];
    list.sort((a, b) => a[0] - b[0]);
    rows = list;
    gaitTables.set(tuning, rows);
  }
  return rows;
}

/**
 * Loudness factor and stride length for a speed, interpolated between the design doc's
 * gaits (crawl, crouch, walk, sprint) so noise always matches what the body is doing.
 */
export function gait(speed: number, tuning: Tuning): { loudness: number; stride: number } {
  const rows = gaitTable(tuning);
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  if (!(speed > first[0])) return { loudness: first[1], stride: first[2] };
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
  // An instant change (a zero stance time) has no transition to wait out.
  p.proneTransition = prone && p.stanceDuration > 0;
}

/** True if nothing solid sits between the body's current top and `height` above its feet. */
function hasHeadroom(p: PlayerState, height: number, ctx: PlayerContext): boolean {
  const { colliders } = ctx.world;
  const r = ctx.tuning.player.radius;
  const current = bodyHeight(p, ctx.tuning);
  colliders.query(p.x - r, p.z - r, p.x + r, p.z + r, ids);
  for (let q = 0; q < ids.length; q++) {
    const c = colliders.list[ids[q]!]!;
    if ((c.flags & Blocks.Move) === 0) continue;
    // Same comparisons as moving: a slab exactly at head height is overhead, not in the way.
    if (c.y0 < p.y + current - 0.01 || c.y0 >= p.y + height) continue;
    if (circleOverlaps(c, p.x, p.z, r)) return false;
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
 * radius `radius` at (x, z). Any real overlap counts: a body that overlaps a low ledge
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
    if (!circleOverlaps(c, x, z, radius)) continue;
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
  return stanceVisibility(p, tuning) * movementVisibility(p, tuning) * tuning.visibility.light.lit;
}

/**
 * The sight table's stance factor for how tall the body actually is: interpolated by
 * eye height between the stand, crouch and prone rows, so diving prone in view of a
 * guard only helps once you're actually down.
 */
export function stanceVisibility(p: PlayerState, tuning: Tuning): number {
  const E = tuning.player.eyeHeight;
  const S = tuning.visibility.stance;
  const e = p.eyeHeight;
  if (e >= E.stand) return S.stand;
  if (e >= E.crouch) return S.crouch + ((S.stand - S.crouch) * (e - E.crouch)) / (E.stand - E.crouch);
  if (e > E.prone) return S.prone + ((S.crouch - S.prone) * (e - E.prone)) / (E.crouch - E.prone);
  return S.prone;
}

/** The sight table's movement factor for how fast the body is actually moving. */
export function movementVisibility(p: PlayerState, tuning: Tuning): number {
  const V = tuning.visibility;
  if (p.speed < 0.2) return V.movement.still;
  if (p.speed > tuning.player.speed.walk + 0.25) return V.movement.sprinting;
  return V.movement.moving;
}
