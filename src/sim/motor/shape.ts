import { dcos, dsin } from '../core/detmath';
import type { BodySpec, BodyState } from './body';

/**
 * A body's shape, for everything that asks what can be seen or hit: a head sphere at the
 * eye, a torso capsule and a legs capsule. Standing and crouched it is upright; prone it
 * lies along the facing, head first. Between stances it follows the eye, so a guard
 * half-way down is half-way down for sight and hits alike. The guards' meshes are built
 * from the same numbers, so what is drawn is what is hit.
 *
 * The motor still collides with a circle (radius) up to the body's height; lab C decides
 * whether a prone body collides as long as it is.
 */

export type BodyPart = 'head' | 'torso' | 'legs';

export interface Sphere {
  x: number;
  y: number;
  z: number;
  r: number;
}

/** A capsule: the segment from a to b, grown by r. */
export interface Capsule {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  r: number;
}

export interface BodyShape {
  head: Sphere;
  torso: Capsule;
  legs: Capsule;
}

export function emptyShape(): BodyShape {
  return {
    head: { x: 0, y: 0, z: 0, r: 0 },
    torso: { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, r: 0 },
    legs: { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, r: 0 },
  };
}

/** The sizes of a body's parts (each body kind's `parts`). */
type Parts = BodySpec['parts'];

const upright = emptyShape();
const lying = emptyShape();

/** The shape of a body as it stands now, written to `out`. */
export function bodyShape(b: BodyState, spec: BodySpec, out: BodyShape): BodyShape {
  const B = spec.parts;
  const E = spec.eyeHeight;
  const e = b.eyeHeight;
  if (e >= E.crouch) {
    // Upright, between crouching and standing: hips follow the eye.
    const t = E.stand > E.crouch ? Math.min(1, (e - E.crouch) / (E.stand - E.crouch)) : 1;
    const hip = B.hip * (spec.height.crouch + (spec.height.stand - spec.height.crouch) * t);
    return uprightShape(b.x, b.y, b.z, e, hip, B, out);
  }
  // Between prone and crouching: from lying down to the crouch, by the eye.
  const t = E.crouch > E.prone ? Math.max(0, (e - E.prone) / (E.crouch - E.prone)) : 0;
  uprightShape(b.x, b.y, b.z, E.crouch, B.hip * spec.height.crouch, B, upright);
  lyingShape(b, E.prone, B, lying);
  mixSphere(lying.head, upright.head, t, out.head);
  mixCapsule(lying.torso, upright.torso, t, out.torso);
  mixCapsule(lying.legs, upright.legs, t, out.legs);
  return out;
}

function uprightShape(x: number, y: number, z: number, eye: number, hip: number, B: Parts, out: BodyShape): BodyShape {
  const shoulders = Math.max(hip, eye - B.neck);
  out.head.x = x;
  out.head.y = y + eye;
  out.head.z = z;
  out.head.r = B.headRadius;
  setCapsule(out.torso, x, y + hip, z, x, y + shoulders, z, B.torsoRadius);
  setCapsule(out.legs, x, y + B.legRadius, z, x, y + Math.max(B.legRadius, hip), z, B.legRadius);
  return out;
}

function lyingShape(b: BodyState, eye: number, B: Parts, out: BodyShape): BodyShape {
  // Along the facing, centred on the body: head at the front, heels at the back.
  const fx = -dsin(b.yaw);
  const fz = -dcos(b.yaw);
  const half = B.proneLength / 2;
  const at = (s: number): [number, number] => [b.x + fx * s, b.z + fz * s];
  const [hx, hz] = at(half - B.headRadius);
  out.head.x = hx;
  out.head.y = b.y + eye;
  out.head.z = hz;
  out.head.r = B.headRadius;
  const [sx, sz] = at(half - 2 * B.headRadius - B.torsoRadius);
  const [px, pz] = at(0);
  setCapsule(out.torso, px, b.y + B.torsoRadius, pz, sx, b.y + B.torsoRadius, sz, B.torsoRadius);
  const [fx2, fz2] = at(-half + B.legRadius);
  setCapsule(out.legs, fx2, b.y + B.legRadius, fz2, px, b.y + B.legRadius, pz, B.legRadius);
  return out;
}

function setCapsule(c: Capsule, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number): void {
  c.ax = ax;
  c.ay = ay;
  c.az = az;
  c.bx = bx;
  c.by = by;
  c.bz = bz;
  c.r = r;
}

function mixSphere(a: Sphere, b: Sphere, t: number, out: Sphere): void {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
  out.r = a.r + (b.r - a.r) * t;
}

function mixCapsule(a: Capsule, b: Capsule, t: number, out: Capsule): void {
  setCapsule(
    out,
    a.ax + (b.ax - a.ax) * t,
    a.ay + (b.ay - a.ay) * t,
    a.az + (b.az - a.az) * t,
    a.bx + (b.bx - a.bx) * t,
    a.by + (b.by - a.by) * t,
    a.bz + (b.bz - a.bz) * t,
    a.r + (b.r - a.r) * t,
  );
}

/**
 * Distance along a normalised ray to a sphere, or −1; 0 if the ray starts inside. Writes
 * the outward normal at the hit to `n`.
 */
export function raySphere(s: Sphere, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, n: { x: number; y: number; z: number }): number {
  const px = ox - s.x;
  const py = oy - s.y;
  const pz = oz - s.z;
  const b = px * dx + py * dy + pz * dz;
  const c = px * px + py * py + pz * pz - s.r * s.r;
  if (c <= 0) {
    n.x = -dx;
    n.y = -dy;
    n.z = -dz;
    return 0;
  }
  if (b > 0) return -1;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  n.x = (px + dx * t) / s.r;
  n.y = (py + dy * t) / s.r;
  n.z = (pz + dz * t) / s.r;
  return t;
}

const end: Sphere = { x: 0, y: 0, z: 0, r: 0 };
const endNormal = { x: 0, y: 0, z: 0 };

/** Distance along a normalised ray to a capsule, or −1; 0 if the ray starts inside. Writes the outward normal to `n`. */
export function rayCapsule(c: Capsule, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, n: { x: number; y: number; z: number }): number {
  // The infinite cylinder around the axis first, then the end spheres.
  const ax = c.bx - c.ax;
  const ay = c.by - c.ay;
  const az = c.bz - c.az;
  const len2 = ax * ax + ay * ay + az * az;
  let best = -1;
  if (len2 > 1e-12) {
    const px = ox - c.ax;
    const py = oy - c.ay;
    const pz = oz - c.az;
    const dDotA = dx * ax + dy * ay + dz * az;
    const pDotA = px * ax + py * ay + pz * az;
    const qa = len2 - dDotA * dDotA;
    const qb = len2 * (px * dx + py * dy + pz * dz) - pDotA * dDotA;
    const qc = len2 * (px * px + py * py + pz * pz) - pDotA * pDotA - c.r * c.r * len2;
    if (qc <= 0) {
      // Starting inside the infinite cylinder: inside the capsule if between the ends.
      const s = pDotA / len2;
      if (s >= 0 && s <= 1) {
        n.x = -dx;
        n.y = -dy;
        n.z = -dz;
        return 0;
      }
    } else if (qa > 1e-12) {
      const disc = qb * qb - qa * qc;
      if (disc >= 0) {
        const t = (-qb - Math.sqrt(disc)) / qa;
        const s = (pDotA + t * dDotA) / len2;
        if (t >= 0 && s >= 0 && s <= 1) {
          best = t;
          const hx = px + dx * t - ax * s;
          const hy = py + dy * t - ay * s;
          const hz = pz + dz * t - az * s;
          n.x = hx / c.r;
          n.y = hy / c.r;
          n.z = hz / c.r;
        }
      }
    }
  }
  for (let k = 0; k < 2; k++) {
    end.x = k === 0 ? c.ax : c.bx;
    end.y = k === 0 ? c.ay : c.by;
    end.z = k === 0 ? c.az : c.bz;
    end.r = c.r;
    const t = raySphere(end, ox, oy, oz, dx, dy, dz, endNormal);
    if (t >= 0 && (best < 0 || t < best)) {
      best = t;
      n.x = endNormal.x;
      n.y = endNormal.y;
      n.z = endNormal.z;
    }
  }
  return best;
}
