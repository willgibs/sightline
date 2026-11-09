import type { World } from './world';
import type { EntityId } from '../state';
import { rayCapsule, raySphere, type BodyPart, type BodyShape } from './shape';
import { Blocks, type Collider, type RayHit } from './colliders';
import { makeTerrainSample } from './heightfield';
import { crownsOf } from './foliage';
import type { Solids } from './solids';
import { Surface } from './surfaces';
import type { WorkCounts } from '../work';

/**
 * One answer to "what does this line hit": the terrain, everything solid (the world's
 * colliders and entities' shapes) and the bodies, with the point, the surface normal,
 * what it was and, for a body, which part. Sight, hearing, shots and the rangefinder all
 * ask here, with different masks, so if a guard can see your head, you can hit his.
 *
 * Masks are collider flags (colliders.ts): Blocks.Sight, Blocks.Bullet, Blocks.Sound,
 * Blocks.Move. The terrain blocks everything. Bodies block sight and bullets, not sound.
 * Tree crowns (foliage.ts) stop sight and bullets alike, once a line has been through
 * more of them than the world's `crownStop`: what you can't see through you can't shoot through.
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
  what: 'none' | 'terrain' | 'collider' | 'body' | 'crown';
  /** The collider's id (an entity's shape: entityOfCollider gives the entity), or the body's entity id; −1 otherwise. */
  id: number;
  part: BodyPart | null;
  /** The ground or the collider's surface; null for a body or nothing. */
  surface: Surface | null;
  /** How much crown (density × length) the ray went through on its way; 0 for none. */
  depth: number;
}

export function emptyHit(): Hit {
  return { dist: Infinity, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, what: 'none', id: -1, part: null, surface: null, depth: 0 };
}

/** A body as queries see it: its entity id and its shape now (motor/shape.ts). */
export interface QueryBody {
  id: EntityId;
  shape: BodyShape;
}

/** What a query looks through: the world, what is solid now, and the bodies as they stand now (Simulation.queryView). */
export interface QueryView {
  readonly world: World;
  readonly solids: Solids;
  readonly bodies: readonly QueryBody[];
  /** Where the rays cast through this view are counted (work.ts): a simulation's; none for a view made by hand. */
  readonly work?: WorkCounts;
}

/** The masks bodies and tree crowns stand in the way of. */
const BODY_BLOCKS = Blocks.Sight | Blocks.Bullet;
/** For `raycast`'s `spent`: leave the crowns out, because the caller weighs them itself. */
export const IGNORE_CROWNS = -Infinity;

const sample = makeTerrainSample();
const colliderHit: RayHit = { dist: Infinity, id: -1 };
const n = { x: 0, y: 0, z: 0 };
const through = { depth: 0 };

/**
 * The first thing a normalised ray hits within `maxDist`, among the terrain, the
 * colliders matching `mask`, the world's tree crowns, and `bodies` (except the one with id
 * `ignore`, usually the one asking). `spent` is how much crown this line has already been
 * through, for a bullet swept piece by piece. Writes to and returns `out`.
 */
export function raycast(
  view: QueryView,
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
  spent = 0,
): Hit {
  out.dist = Infinity;
  out.what = 'none';
  out.id = -1;
  out.part = null;
  out.surface = null;
  out.depth = 0;
  const { world, solids, bodies } = view;
  if (view.work) view.work.rays++;

  const t = world.terrain.raycast(ox, oy, oz, dx, dy, dz, maxDist);
  if (t <= maxDist) {
    out.dist = t;
    out.what = 'terrain';
  }
  solids.raycast(ox, oy, oz, dx, dy, dz, Math.min(maxDist, out.dist), mask, colliderHit);
  if (colliderHit.id >= 0 && colliderHit.dist < out.dist) {
    out.dist = colliderHit.dist;
    out.what = 'collider';
    out.id = colliderHit.id;
  }
  if ((mask & BODY_BLOCKS) !== 0 && world.crownStop !== undefined && spent !== IGNORE_CROWNS) {
    // Nothing's been spent yet: this is where the line begins, and the crown round its start is no bar to it.
    const stop = crownsOf(world).stopAlong(ox, oy, oz, dx, dy, dz, out.dist < maxDist ? out.dist : maxDist, world.crownStop - spent, through, spent === 0);
    out.depth = through.depth;
    if (stop < out.dist) {
      out.dist = stop;
      out.what = 'crown';
      out.id = -1;
    }
  }
  if ((mask & BODY_BLOCKS) !== 0) {
    // Bodies count only within reach, like everything else.
    for (const b of bodies) {
      if (b.id === ignore) continue;
      const s = b.shape;
      let d = raySphere(s.head, ox, oy, oz, dx, dy, dz, n);
      if (d >= 0 && d <= maxDist && d < out.dist) take(out, d, b.id, 'head');
      d = rayCapsule(s.torso, ox, oy, oz, dx, dy, dz, n);
      if (d >= 0 && d <= maxDist && d < out.dist) take(out, d, b.id, 'torso');
      d = rayCapsule(s.legs, ox, oy, oz, dx, dy, dz, n);
      if (d >= 0 && d <= maxDist && d < out.dist) take(out, d, b.id, 'legs');
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
    const c = solids.get(out.id);
    colliderNormal(c, out.x, out.y, out.z, out);
    out.surface = c.surface;
  } else if (out.what === 'crown') {
    // Nothing there has a surface of its own: the line just ends, among the branches.
    out.nx = -dx;
    out.ny = -dy;
    out.nz = -dz;
    out.surface = Surface.Wood;
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
 * out of `bodies` by the caller, or the line ends on it. Tree crowns are weighed by the
 * two ends, so the answer is the same bit for bit whichever end is the eye.
 */
export function sightLine(
  view: QueryView,
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
  raycast(view, ax, ay, az, dx / d, dy / d, dz / d, d, mask, sight, ignore, IGNORE_CROWNS);
  if (sight.dist < d - 1e-6) return false;
  const stop = view.world.crownStop;
  return stop === undefined || (mask & BODY_BLOCKS) === 0 || crownsOf(view.world).opticalDepth(ax, ay, az, bx, by, bz, true) < stop;
}
