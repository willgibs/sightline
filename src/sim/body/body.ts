import type { Tuning } from '../../config/tuning';
import { yawFromDirection } from '../kernel/core/math';
import type { StanceName, StepGait } from '../kernel/events';
import type { Entity } from '../kernel/state';
import type { World } from '../kernel/world/world';
import { Blocks, circleOverlaps } from '../kernel/world/colliders';
import { makeTerrainSample } from '../kernel/world/heightfield';
import type { Solids } from '../kernel/world/solids';
import { Surface } from '../kernel/world/surfaces';

/**
 * A body: the physical state of anything that moves under its own power, walks, falls
 * and makes noise. The shared motor (motor.ts) moves every body the same way, so the
 * player and, from M5, the guards obey one set of rules for slopes, steps, collision
 * and footsteps.
 *
 * A body is plain data in the state tree. What it may do comes from its spec, one of the
 * kinds in tuning.bodies: sizes, speeds, accelerations, limits and the parts it is made
 * of. Everything a body kind can do is in its spec, so a new kind is data, not code.
 */

export type Stance = StanceName;

/** How a body is moving: its gait decides speed, noise and stride. */
export type Gait = 'idle' | StepGait;

/**
 * Which motor mode owns the body. Each mode moves the body its own way and keeps its own
 * invariants (see motor.ts): on the ground it walks, steps and slides; in the air it
 * falls; in a mantle it follows a path of its own. Later modes could swim or glide.
 */
export type MotorModeName = 'ground' | 'air' | 'mantle';

/** A mantle under way (mantle.ts): its path, as plain data in the state tree. */
export interface MantleState {
  /** Seconds along the path. It advances only while the next pose is clear. */
  t: number;
  /** Seconds it has waited for something to get out of the way, since it last moved. */
  waited: number;
  /** Waypoints as x, y, z triples: the start, at the wall, above the ledge, over the landing, the landing. */
  points: number[];
  /** Seconds each leg between waypoints takes: reach, pull, shift, push. */
  legs: number[];
  /** It began standing: stand up again at the end, if there's room. */
  stand: boolean;
  /** What the hands take hold of, and what the feet land on. */
  grip: Surface;
  feet: Surface;
  /** The hands have taken hold (its sound has been made). */
  grabbed: boolean;
  /** How far it is lowered down the far side, metres. */
  dropped: number;
}

/** A kind of body: its sizes, limits and parts (tuning.bodies). Every kind has the same fields; a test keeps them so. */
export type BodySpec = Tuning['bodies']['player'];

/** Where a body was at the end of a tick: enough to place its eye and shape between ticks. */
export interface PoseSample {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  eyeHeight: number;
  lean: number;
}

export interface BodyState {
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
  /** Eye height when the current stance change began. */
  eyeFrom: number;
  eyeHeight: number;
  /** How far the head is leaned to the body's right (negative: left), metres (lean.ts). */
  lean: number;
  motor: MotorModeName;
  /** The mantle under way, or null (mantle.ts). */
  mantle: MantleState | null;
  /** On the ground but on terrain too steep to stand on: no traction, sliding down. */
  sliding: boolean;
  /** Distance walked since the last footstep (shoves from others don't count). */
  stride: number;
  gait: Gait;
  /** Actual horizontal speed this tick, m/s. */
  speed: number;
  surface: Surface;
  slopeTan: number;
  /** Loudness of the current movement; 0 when still. */
  loudness: number;
  /** Collider stood on, or -1 for terrain. */
  standingOn: number;
  /**
   * The pose at the end of the last two ticks, newest first. Something that happened
   * between ticks, such as a shot fired from a frame drawn between them, is resolved
   * against these (poseAt).
   */
  history: [PoseSample, PoseSample];
}

/** The entities with a body the motor moves: every kind whose entities have a `body`. */
export type BodyEntity = Extract<Entity, { body: BodyState }>;

export function hasBody(e: Entity): e is BodyEntity {
  return 'body' in e;
}

/** Directions for testing the body's rim against the terrain: 12 around the circle. */
export const RIM = [
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

const ids: number[] = [];

/**
 * A body standing at (x, z) facing (faceX, faceZ): where a body walking there would
 * stand, on the terrain or anything low enough to step onto. Only if that would be
 * inside something solid does it stand on top. `standY` raises where to look, for a
 * body that starts up on something: a sentry on his tower's deck.
 */
export function createBody(world: World, solids: Solids, spec: BodySpec, x: number, z: number, faceX: number, faceZ: number, standY?: number): BodyState {
  const from = standY ?? world.terrain.heightAt(x, z);
  let ground = groundBelow(world, solids, x, z, from + spec.stepHeight, spec.radius);
  if (solidAround(solids, x, z, ground.height + spec.stepHeight, ground.height + spec.height.stand, spec.radius)) {
    ground = groundBelow(world, solids, x, z, Infinity, spec.radius);
  }
  const y = ground.height;
  const surface = ground.surface;
  const standingOn = ground.collider;
  const yaw = yawFromDirection(faceX, faceZ);
  const pose = (): PoseSample => ({ x, y, z, yaw, pitch: 0, eyeHeight: spec.eyeHeight.stand, lean: 0 });
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw,
    pitch: 0,
    stance: 'stand',
    stanceTimer: 0,
    stanceDuration: 0,
    proneTransition: false,
    eyeFrom: spec.eyeHeight.stand,
    eyeHeight: spec.eyeHeight.stand,
    lean: 0,
    motor: 'ground',
    mantle: null,
    sliding: false,
    stride: 0,
    gait: 'idle',
    speed: 0,
    surface,
    slopeTan: 0,
    loudness: 0,
    standingOn,
    history: [pose(), pose()],
  };
}

/** Moves the history on: the pose the body ends this tick with becomes the newest sample. Call before a tick moves the body. */
export function pushHistory(b: BodyState): void {
  const [h0, h1] = b.history;
  h1.x = h0.x;
  h1.y = h0.y;
  h1.z = h0.z;
  h1.yaw = h0.yaw;
  h1.pitch = h0.pitch;
  h1.eyeHeight = h0.eyeHeight;
  h1.lean = h0.lean;
  h0.x = b.x;
  h0.y = b.y;
  h0.z = b.z;
  h0.yaw = b.yaw;
  h0.pitch = b.pitch;
  h0.eyeHeight = b.eyeHeight;
  h0.lean = b.lean;
}

/**
 * Where the body was `lag` ticks before now (0 to 2), between its samples: now is the
 * body's current state, 1 the end of the last tick, 2 the one before. Before the motor
 * runs in a tick, "now" is the end of the previous tick, so a command with lag 1 − α
 * finds the pose drawn at fraction α between the last two ticks.
 */
export function poseAt(b: BodyState, lag: number, out: PoseSample): PoseSample {
  const [h0, h1] = b.history;
  const l = lag < 0 ? 0 : lag > 2 ? 2 : lag;
  const newer: PoseSample = l <= 1 ? b : h0;
  const older = l <= 1 ? h0 : h1;
  const t = l <= 1 ? l : l - 1; // 0 at the newer sample, 1 at the older
  out.x = newer.x + (older.x - newer.x) * t;
  out.y = newer.y + (older.y - newer.y) * t;
  out.z = newer.z + (older.z - newer.z) * t;
  out.yaw = newer.yaw; // angles come from the command, not from history
  out.pitch = newer.pitch;
  out.eyeHeight = newer.eyeHeight + (older.eyeHeight - newer.eyeHeight) * t;
  out.lean = newer.lean + (older.lean - newer.lean) * t;
  return out;
}

/**
 * How tall the body actually is. During a stance change the eye eases toward the new
 * height while the stance already names the target, so the body is as tall as its eye
 * plus the target stance's head clearance, and never shorter than the target. Collision,
 * headroom and sight all use this, so the body can't slip under a slab its eye is above.
 */
export function bodyHeight(b: BodyState, spec: BodySpec): number {
  return Math.max(spec.height[b.stance], b.eyeHeight + (spec.height[b.stance] - spec.eyeHeight[b.stance]));
}

/** True if a solid collider overlaps the vertical band [y0, y1) of a body at (x, z). */
export function solidAround(solids: Solids, x: number, z: number, y0: number, y1: number, r: number): boolean {
  solids.query(x - r, z - r, x + r, z + r, ids);
  for (let q = 0; q < ids.length; q++) {
    const c = solids.get(ids[q]!);
    if ((c.flags & Blocks.Move) !== 0 && c.y1 > y0 && c.y0 < y1 && circleOverlaps(c, x, z, r)) return true;
  }
  return false;
}

/** How far the terrain inside the body's rim rises above a step, at most; 0 or less if clear. */
export function rimExcess(world: World, x: number, z: number, feet: number, r: number, stepHeight: number): number {
  let worst = -Infinity;
  for (let k = 0; k < RIM.length; k++) {
    const e = world.terrain.heightAt(x + RIM[k]![0] * r, z + RIM[k]![1] * r) - (feet + stepHeight);
    if (e > worst) worst = e;
  }
  return worst;
}

export interface Ground {
  height: number;
  surface: Surface;
  /** Collider stood on, or -1 for terrain. */
  collider: number;
}

const sample = makeTerrainSample();
const groundOut: Ground = { height: 0, surface: Surface.Grass, collider: -1 };

/**
 * The terrain, or the highest collider top within reach (`maxTop`) under a body of
 * radius `radius` at (x, z). Any real overlap counts: a body that overlaps a low ledge
 * stands on it. Otherwise it would stand beside the ledge while overlapping it, and a
 * small drop in the terrain would turn the ledge into a wall it is already inside.
 * The result is reused by the next call; copy what you keep.
 */
export function groundBelow(world: World, solids: Solids, x: number, z: number, maxTop: number, radius: number): Ground {
  world.terrain.sample(x, z, sample);
  groundOut.height = sample.height;
  groundOut.surface = sample.surface;
  groundOut.collider = -1;
  solids.query(x - radius, z - radius, x + radius, z + radius, ids);
  for (let q = 0; q < ids.length; q++) {
    const c = solids.get(ids[q]!);
    if ((c.flags & Blocks.Move) === 0) continue;
    if (c.y1 > maxTop || c.y1 <= groundOut.height) continue;
    if (!circleOverlaps(c, x, z, radius)) continue;
    groundOut.height = c.y1;
    groundOut.surface = c.surface;
    groundOut.collider = c.id;
  }
  return groundOut;
}
