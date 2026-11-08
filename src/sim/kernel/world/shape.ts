/**
 * A body's shape, as everything that asks what can be seen or hit sees it: a head sphere,
 * a torso capsule and a legs capsule, and the ray tests against them. How a body's state
 * becomes its shape is the body lane's (body/shape.ts); queries (query.ts) take the shapes
 * as they stand now.
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
