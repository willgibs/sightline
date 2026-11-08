import type { EntityBase, EntityId } from '../kernel/state';
import type { BodyPart } from '../kernel/world/shape';
import { raySphere, rayCapsule, type Capsule, type Sphere } from '../kernel/world/shape';
import { Blocks } from '../kernel/world/colliders';
import { emptyHit, raycast, type QueryBody, type QueryView } from '../kernel/world/query';
import type { Surface } from '../kernel/world/surfaces';
import { flightAt, velocityAt, vec3, type Flight, type Vec3 } from './trajectory';

/**
 * Bullets in flight: entities in the state tree, each nothing but its launch (a Flight)
 * and how far along its path it has been swept, so its position at any instant is exact
 * (trajectory.ts). Flying a bullet sweeps its path, one tick's chord at a time, against
 * the terrain, the colliders and every body part as the bodies move between their two
 * poses; the first thing in the way is its strike. A chord bends from the true path by
 * about 1.4 mm over a tick at the muzzle, so there is no sub-stepping.
 *
 * What a strike does (a guard killed, a body left behind, the sounds) is the game's.
 */

export interface BulletState {
  /** Who fired it. */
  shooter: EntityId;
  /** The id of the shot event that launched it: the cause of everything it does. */
  shot: number;
  flight: Flight;
  /** Mission time up to which its path has been swept. */
  swept: number;
}

export interface BulletEntity extends EntityBase {
  kind: 'bullet';
  bullet: BulletState;
}

declare module '../kernel/state' {
  interface EntityKinds {
    bullet: BulletEntity;
  }
}

/** What a bullet struck: where, when, and what. */
export interface Strike {
  /** Mission time. */
  t: number;
  x: number;
  y: number;
  z: number;
  /** The struck surface's outward normal. */
  nx: number;
  ny: number;
  nz: number;
  what: 'terrain' | 'collider' | 'body';
  /** The collider's id, or the body's entity id; −1 for the terrain. */
  id: number;
  part: BodyPart | null;
  /** The ground's or the collider's surface; null for a body. */
  surface: Surface | null;
  /** Speed at the strike, m/s. */
  speed: number;
}

export function emptyStrike(): Strike {
  return { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, what: 'terrain', id: -1, part: null, surface: null, speed: 0 };
}

/** The bodies as they stood at a mission time: their shapes then, in entity order (the game knows every kind with a shape). */
export type BodiesAt = (t: number, out: QueryBody[]) => QueryBody[];

const p0 = vec3();
const p1 = vec3();
const v = vec3();
const hit = emptyHit();
const from: QueryBody[] = [];
const to: QueryBody[] = [];
const n = { x: 0, y: 0, z: 0 };
const moved: Sphere = { x: 0, y: 0, z: 0, r: 0 };
const movedCapsule: Capsule = { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, r: 0 };

/**
 * Flies a bullet on to mission time `until`, sweeping its path piece by piece: each piece
 * ends at the next whole tick (`dt` apart from 0), so the bodies move in a straight line
 * within it. Returns the first strike, written to `out`, or null if the path is clear;
 * either way the bullet has been swept to the strike or to `until`.
 */
export function fly(b: BulletState, until: number, dt: number, world: QueryView, bodiesAt: BodiesAt, out: Strike): Strike | null {
  // Only the terrain and the colliders here; the bodies are swept as they move.
  const still: QueryView = { world: world.world, solids: world.solids, bodies: NO_BODIES, work: world.work };
  while (b.swept < until) {
    const t0 = b.swept;
    const boundary = (Math.floor(t0 / dt + 1e-9) + 1) * dt;
    const t1 = Math.min(until, boundary);
    if (sweepPiece(b, t0, t1, still, bodiesAt, out)) {
      b.swept = out.t;
      return out;
    }
    b.swept = t1;
  }
  return null;
}

const NO_BODIES: readonly QueryBody[] = Object.freeze([]);

/** One piece of the path, t0 to t1: the first strike along its chord, or false. */
function sweepPiece(b: BulletState, t0: number, t1: number, still: QueryView, bodiesAt: BodiesAt, out: Strike): boolean {
  const f = b.flight;
  flightAt(f, t0, p0);
  flightAt(f, t1, p1);
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const dz = p1.z - p0.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-9) return false;
  // The terrain and the colliders don't move: one ray along the chord.
  raycast(still, p0.x, p0.y, p0.z, dx / len, dy / len, dz / len, len, Blocks.Bullet, hit);
  let best = hit.what === 'none' ? Infinity : hit.dist / len;
  if (best < Infinity) {
    out.what = hit.what === 'terrain' ? 'terrain' : 'collider';
    out.id = hit.what === 'terrain' ? -1 : hit.id;
    out.part = null;
    out.surface = hit.surface;
    out.nx = hit.nx;
    out.ny = hit.ny;
    out.nz = hit.nz;
  }
  // Every body part, moving from its pose at t0 to its pose at t1: in its own frame the
  // bullet's chord is a straight line too, against a part standing still.
  bodiesAt(t0, from);
  bodiesAt(t1, to);
  for (let k = 0; k < from.length && k < to.length; k++) {
    const a = from[k]!;
    const z = to[k]!;
    if (a.id !== z.id || a.id === b.shooter) continue;
    const parts = [
      partStrike(a.shape.head, z.shape.head, p0, p1),
      partStrike(a.shape.torso, z.shape.torso, p0, p1),
      partStrike(a.shape.legs, z.shape.legs, p0, p1),
    ] as const;
    const names: readonly BodyPart[] = ['head', 'torso', 'legs'];
    for (let q = 0; q < 3; q++) {
      const s = parts[q]![0];
      if (s >= 0 && s < best) {
        best = s;
        out.what = 'body';
        out.id = a.id;
        out.part = names[q]!;
        out.surface = null;
        out.nx = parts[q]![1];
        out.ny = parts[q]![2];
        out.nz = parts[q]![3];
      }
    }
  }
  if (best === Infinity) return false;
  out.t = t0 + (t1 - t0) * best;
  out.x = p0.x + dx * best;
  out.y = p0.y + dy * best;
  out.z = p0.z + dz * best;
  velocityAt(f, out.t, v);
  out.speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  return true;
}

/**
 * Where along a chord from `a` to `b` (0 to 1) a body part moving from `p` to `q` is
 * struck, and the normal there; −1 if it isn't. A sphere or a capsule, by its fields.
 */
function partStrike(p: Sphere | Capsule, q: Sphere | Capsule, a: Vec3, b: Vec3): readonly [number, number, number, number] {
  // The part's own motion over the piece, taken off the chord's end.
  const sphere = 'x' in p;
  const mx = sphere ? (q as Sphere).x - (p as Sphere).x : ((q as Capsule).ax - (p as Capsule).ax + (q as Capsule).bx - (p as Capsule).bx) / 2;
  const my = sphere ? (q as Sphere).y - (p as Sphere).y : ((q as Capsule).ay - (p as Capsule).ay + (q as Capsule).by - (p as Capsule).by) / 2;
  const mz = sphere ? (q as Sphere).z - (p as Sphere).z : ((q as Capsule).az - (p as Capsule).az + (q as Capsule).bz - (p as Capsule).bz) / 2;
  const ex = b.x - mx - a.x;
  const ey = b.y - my - a.y;
  const ez = b.z - mz - a.z;
  const len = Math.sqrt(ex * ex + ey * ey + ez * ez);
  if (len < 1e-12) return MISS;
  let d: number;
  if (sphere) {
    const s = p as Sphere;
    moved.x = s.x;
    moved.y = s.y;
    moved.z = s.z;
    moved.r = s.r;
    d = raySphere(moved, a.x, a.y, a.z, ex / len, ey / len, ez / len, n);
  } else {
    const c = p as Capsule;
    Object.assign(movedCapsule, c);
    d = rayCapsule(movedCapsule, a.x, a.y, a.z, ex / len, ey / len, ez / len, n);
  }
  if (d < 0 || d > len) return MISS;
  return [d / len, n.x, n.y, n.z];
}

const MISS = [-1, 0, 0, 0] as const;
