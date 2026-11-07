import type { World } from '../gen/world';
import type { EntityId } from '../state';
import { rayCapsule, raySphere, type BodyPart, type BodyShape } from '../motor/shape';
import { Blocks, type Collider, type RayHit } from './colliders';
import { makeTerrainSample } from './heightfield';
import type { Surface } from './surfaces';

/**
 * One answer to "what does this line hit": the terrain, the colliders and the bodies, with
 * the point, the surface normal, what it was and, for a body, which part. Sight, hearing,
 * shots and the rangefinder all ask here, with different masks, so if a guard can see
 * your head, you can hit his.
 *
 * Masks are collider flags (colliders.ts): Blocks.Sight, Blocks.Bullet, Blocks.Sound,
 * Blocks.Move. The terrain blocks everything. Bodies block sight and bullets, not sound.
 */

export interface Hit {
  /** Distance along the ray; Infinity when nothing is hit within reach. */
  dist: number;
  x: number;
  y: number;
  z: number;
  /** The surface's outward normal at the hit. */
  nx: number;
  ny: number;
  nz: number;
  what: 'none' | 'terrain' | 'collider' | 'body';
  /** The collider's id, or the body's entity id; −1 otherwise. */
  id: number;
  part: BodyPart | null;
  /** The ground or the collider's surface; null for a body or nothing. */
  surface: Surface | null;
}

export function emptyHit(): Hit {
  return { dist: Infinity, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, what: 'none', id: -1, part: null, surface: null };
}

/** A body as queries see it: its entity id and its shape now (motor/shape.ts). */
export interface QueryBody {
  id: EntityId;
  shape: BodyShape;
}

/** The masks bodies stand in the way of. */
const BODY_BLOCKS = Blocks.Sight | Blocks.Bullet;

const sample = makeTerrainSample();
const colliderHit: RayHit = { dist: Infinity, id: -1 };
const n = { x: 0, y: 0, z: 0 };

/**
 * The first thing a normalised ray hits within `maxDist`, among the terrain, the
 * colliders matching `mask`, and `bodies` (except the one with id `ignore`, usually the
 * one asking). Writes to and returns `out`.
 */
export function raycast(
  world: World,
  bodies: readonly QueryBody[],
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  mask: number,
  out: Hit,
  ignore: EntityId = -1,
): Hit {
  out.dist = Infinity;
  out.what = 'none';
  out.id = -1;
  out.part = null;
  out.surface = null;

  const t = world.terrain.raycast(ox, oy, oz, dx, dy, dz, maxDist);
  if (t <= maxDist) {
    out.dist = t;
    out.what = 'terrain';
  }
  world.colliders.raycast(ox, oy, oz, dx, dy, dz, Math.min(maxDist, out.dist), mask, colliderHit);
  if (colliderHit.id >= 0 && colliderHit.dist < out.dist) {
    out.dist = colliderHit.dist;
    out.what = 'collider';
    out.id = colliderHit.id;
  }
  if ((mask & BODY_BLOCKS) !== 0) {
    for (const b of bodies) {
      if (b.id === ignore) continue;
      const s = b.shape;
      let d = raySphere(s.head, ox, oy, oz, dx, dy, dz, n);
      if (d >= 0 && d < out.dist) take(out, d, b.id, 'head');
      d = rayCapsule(s.torso, ox, oy, oz, dx, dy, dz, n);
      if (d >= 0 && d < out.dist) take(out, d, b.id, 'torso');
      d = rayCapsule(s.legs, ox, oy, oz, dx, dy, dz, n);
      if (d >= 0 && d < out.dist) take(out, d, b.id, 'legs');
    }
  }
  if (out.what === 'none') return out;

  out.x = ox + dx * out.dist;
  out.y = oy + dy * out.dist;
  out.z = oz + dz * out.dist;
  if (out.what === 'terrain') {
    world.terrain.sample(out.x, out.z, sample);
    const l = Math.sqrt(sample.gx * sample.gx + 1 + sample.gz * sample.gz);
    out.nx = -sample.gx / l;
    out.ny = 1 / l;
    out.nz = -sample.gz / l;
    out.surface = sample.surface;
  } else if (out.what === 'collider') {
    const c = world.colliders.list[out.id]!;
    colliderNormal(c, out.x, out.y, out.z, out);
    out.surface = c.surface;
  }
  return out;
}

/** Records a body hit; the normal is in the scratch `n` from the test that found it. */
function take(out: Hit, d: number, id: EntityId, part: BodyPart): void {
  out.dist = d;
  out.what = 'body';
  out.id = id;
  out.part = part;
  out.nx = n.x;
  out.ny = n.y;
  out.nz = n.z;
}

/** The outward normal of a collider's surface at a point on it. */
export function colliderNormal(c: Collider, x: number, y: number, z: number, out: { nx: number; ny: number; nz: number }): void {
  const eps = 1e-6;
  out.nx = 0;
  out.nz = 0;
  if (Math.abs(y - c.y1) < eps) {
    out.ny = 1;
    return;
  }
  if (Math.abs(y - c.y0) < eps) {
    out.ny = -1;
    return;
  }
  out.ny = 0;
  const px = x - c.x;
  const pz = z - c.z;
  if (c.kind === 'cyl') {
    const l = Math.sqrt(px * px + pz * pz) || 1;
    out.nx = px / l;
    out.nz = pz / l;
    return;
  }
  const lx = px * c.ux + pz * c.uz;
  const lz = -px * c.uz + pz * c.ux;
  // Adding 0 keeps a zero component from being −0.
  if (Math.abs(lx) / c.hx >= Math.abs(lz) / c.hz) {
    const s = lx >= 0 ? 1 : -1;
    out.nx = c.ux * s + 0;
    out.nz = c.uz * s + 0;
  } else {
    const s = lz >= 0 ? 1 : -1;
    out.nx = -c.uz * s + 0;
    out.nz = c.ux * s + 0;
  }
}

const sight = emptyHit();

/**
 * True if nothing matching `mask` lies between two points: what a guard's eye needs to see
 * a point on you. `ignore` is the body looking; the body being looked at should be left
 * out of `bodies` by the caller, or the line ends on it.
 */
export function sightLine(
  world: World,
  bodies: readonly QueryBody[],
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  mask: number,
  ignore: EntityId = -1,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d < 1e-9) return true;
  raycast(world, bodies, ax, ay, az, dx / d, dy / d, dz / d, d, mask, sight, ignore);
  return sight.dist >= d - 1e-6;
}
