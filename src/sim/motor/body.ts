import type { Tuning } from '../../config/tuning';
import { yawFromDirection } from '../core/math';
import type { StanceName } from '../events';
import type { World } from '../gen/world';
import { Blocks, circleOverlaps } from '../world/colliders';
import { makeTerrainSample } from '../world/heightfield';
import { Surface } from '../world/surfaces';

/**
 * A body: the physical state of anything that moves under its own power, walks, falls
 * and makes noise. The shared motor (motor.ts) moves every body the same way, so the
 * player and, from M5, the guards obey one set of rules for slopes, steps, collision
 * and footsteps.
 *
 * A body is plain data in the state tree. What it may do comes from its spec: sizes,
 * speeds, accelerations and limits (tuning.player for the player).
 */

export type Stance = StanceName;

/** How a body is moving: its gait decides speed, noise and stride. */
export type Gait = 'idle' | 'sprint' | 'walk' | 'crouch' | 'crawl';

/**
 * Which motor mode owns the body. Each mode moves the body its own way and keeps its own
 * invariants (see motor.ts): on the ground it walks, steps and slides; in the air it
 * falls. Lab C adds traverse (mantle, vault, ladder); later modes could swim or glide.
 */
export type MotorModeName = 'ground' | 'air';

/** A body's sizes and limits. Today the player's (tuning.player); M6 moves them to tuning.bodies. */
export type BodySpec = Tuning['player'];

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
  motor: MotorModeName;
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
}

const ids: number[] = [];

/**
 * A body standing at (x, z) facing (faceX, faceZ): where a body walking there would
 * stand, on the terrain or anything low enough to step onto. Only if that would be
 * inside something solid does it stand on top.
 */
export function createBody(world: World, spec: BodySpec, x: number, z: number, faceX: number, faceZ: number): BodyState {
  const terrainY = world.terrain.heightAt(x, z);
  let y = groundBelow(world, x, z, terrainY + spec.stepHeight, spec.radius).height;
  if (solidAround(world, x, z, y + spec.stepHeight, y + spec.height.stand, spec.radius)) {
    y = groundBelow(world, x, z, Infinity, spec.radius).height;
  }
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: yawFromDirection(faceX, faceZ),
    pitch: 0,
    stance: 'stand',
    stanceTimer: 0,
    stanceDuration: 0,
    proneTransition: false,
    eyeFrom: spec.eyeHeight.stand,
    eyeHeight: spec.eyeHeight.stand,
    motor: 'ground',
    sliding: false,
    stride: 0,
    gait: 'idle',
    speed: 0,
    surface: world.terrain.surfaceAt(x, z),
    slopeTan: 0,
    loudness: 0,
    standingOn: -1,
  };
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
export function solidAround(world: World, x: number, z: number, y0: number, y1: number, r: number): boolean {
  world.colliders.query(x - r, z - r, x + r, z + r, ids);
  for (let q = 0; q < ids.length; q++) {
    const c = world.colliders.list[ids[q]!]!;
    if ((c.flags & Blocks.Move) !== 0 && c.y1 > y0 && c.y0 < y1 && circleOverlaps(c, x, z, r)) return true;
  }
  return false;
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
