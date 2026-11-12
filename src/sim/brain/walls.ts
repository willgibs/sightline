import type { Ground } from './mind';

/**
 * A camp's walls, as its own men know them: where its perimeter runs, and where the openings
 * in it are. Static knowledge of the world (rule 13), like its alarm boxes and its ground. A
 * camp built by hand has no layout, and so no walls to speak of: nothing is outside them.
 */

/** An opening in a camp's perimeter: its middle, the way out of it (a unit vector), and how wide it is. */
export interface Opening {
  x: number;
  z: number;
  nx: number;
  nz: number;
  width: number;
}

/** True if a place is outside the camp's perimeter, by more than `by` metres. */
export function outsideWalls(world: Ground, x: number, z: number, by = 0.5): boolean {
  const L = world.camp.layout;
  if (!L) return false;
  const site = world.camp.site;
  const a = (x - site.x) * L.ux + (z - site.z) * L.uz;
  const b = (x - site.x) * L.vx + (z - site.z) * L.vz;
  return Math.abs(a) > L.halfA + by || Math.abs(b) > L.halfB + by;
}

type Layout = NonNullable<Ground['camp']['layout']>;

/** An opening of the layout, in the world: the front wall is the one at +halfA, the back at −halfA, the left at −halfB and the right at +halfB. */
function openingOf(L: Layout, site: { x: number; z: number }, o: Layout['openings'][number]): Opening {
  const na = o.side === 'front' ? 1 : o.side === 'back' ? -1 : 0;
  const nb = o.side === 'left' ? -1 : o.side === 'right' ? 1 : 0;
  return { x: site.x + o.a * L.ux + o.b * L.vx, z: site.z + o.a * L.uz + o.b * L.vz, nx: na * L.ux + nb * L.vx, nz: na * L.uz + nb * L.vz, width: o.width };
}

/** The opening in the perimeter nearest a place, or null for a camp with none. The first of equals, in the order the camp was laid out. */
export function openingNear(world: Ground, x: number, z: number): Opening | null {
  const L = world.camp.layout;
  if (!L) return null;
  const site = world.camp.site;
  let best: Opening | null = null;
  let least = Infinity;
  for (const o of L.openings) {
    const at = openingOf(L, site, o);
    const d = (at.x - x) * (at.x - x) + (at.z - z) * (at.z - z);
    if (d < least) {
      least = d;
      best = at;
    }
  }
  return best;
}

/**
 * The opening a straight move from a place inside the perimeter to one outside it goes out
 * by: where the line between them first crosses a wall, if that's in an opening, or within
 * `slack` metres of one (a body has a width, and so has a wall's end). Null if the move
 * doesn't leave the perimeter, or leaves it through a wall, which nobody does: a man running
 * at a wall isn't going out.
 */
export function openingThrough(world: Ground, x0: number, z0: number, x1: number, z1: number, slack: number): Opening | null {
  const L = world.camp.layout;
  if (!L || outsideWalls(world, x0, z0) || !outsideWalls(world, x1, z1)) return null;
  const site = world.camp.site;
  const a0 = (x0 - site.x) * L.ux + (z0 - site.z) * L.uz;
  const b0 = (x0 - site.x) * L.vx + (z0 - site.z) * L.vz;
  const a1 = (x1 - site.x) * L.ux + (z1 - site.z) * L.uz;
  const b1 = (x1 - site.x) * L.vx + (z1 - site.z) * L.vz;
  // The first wall crossed: the least fraction of the way at which a coordinate reaches its wall. Someone standing in a
  // gateway is past its line already, by less than the margin `outsideWalls` allows: he crosses it where he stands.
  let least = Infinity;
  let side: Layout['openings'][number]['side'] | null = null;
  const cross = (from: number, to: number, wall: number, which: Layout['openings'][number]['side']): void => {
    const t = Math.max(0, (wall - from) / (to - from));
    if (t < least) {
      least = t;
      side = which;
    }
  };
  if (a1 > L.halfA) cross(a0, a1, L.halfA, 'front');
  if (a1 < -L.halfA) cross(a0, a1, -L.halfA, 'back');
  if (b1 < -L.halfB) cross(b0, b1, -L.halfB, 'left');
  if (b1 > L.halfB) cross(b0, b1, L.halfB, 'right');
  if (side === null) return null;
  const a = a0 + (a1 - a0) * least;
  const b = b0 + (b1 - b0) * least;
  for (const o of L.openings) {
    if (o.side !== side) continue;
    // Along a front or back wall is the frame's other axis, and along a side wall is its first.
    const along = side === 'front' || side === 'back' ? b - o.b : a - o.a;
    if (Math.abs(along) <= o.width / 2 + slack) return openingOf(L, site, o);
  }
  return null;
}
