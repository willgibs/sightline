import type { Tuning } from '../../config/tuning';
import { navigatorOf, openingNear } from '../brain';
import { routinePose, type RoutinePose } from '../generation';
import type { World } from '../kernel/world/world';

/**
 * Ways out of a camp, read off the world as it was generated: the opening someone seen
 * inside would leave by, with a place along the outside of the wall where no post can see
 * him (the out-the-gate scene and its experiment), and where a sitting about that starts.
 * Nothing here is a guard's knowledge: it's the scene's, of where to put its man.
 */

export interface Leaving {
  /** Where he stands to be seen, inside, and the way he faces there. */
  show: { x: number; z: number };
  faceX: number;
  faceZ: number;
  /** The middle of the opening he leaves by, and the way out of it (a unit vector). */
  gate: { x: number; z: number; nx: number; nz: number; width: number };
  /** Just outside it, the place along the wall, and where he'd run on to. */
  out: { x: number; z: number };
  hide: { x: number; z: number };
  away: { x: number; z: number };
}

const leavings = new WeakMap<World, Leaving | null>();
const pose: RoutinePose = { x: 0, z: 0, yaw: 0, headYaw: 0, moving: false, vx: 0, vz: 0 };

/** Metres: how far inside the opening he shows himself, how far outside the wall he walks, and how far along it he goes. */
const INSIDE = [9, 12, 6, 15];
const OFF_WALL = 1.6;
const ALONG = [8, 6, 10, 12];
/** How far he runs on, with `plan=run`. */
const AWAY = 70;

/**
 * A way out of this camp for someone seen inside it: an opening in its perimeter with a place
 * inside it in a ground guard's view, and a place a few metres along the outside of the wall
 * that no post in the camp can see. The first there is, by opening, then distances. Read off
 * the world as generated, so every run of a camp gets the same one. Null where the camp has
 * no wall to follow (chain link hides nobody).
 */
export function leavingOf(world: World, tuning: Tuning): Leaving | null {
  const kept = leavings.get(world);
  if (kept !== undefined) return kept;
  const L = world.camp.layout;
  let found: Leaving | null = null;
  if (L) {
    const nav = navigatorOf(world, tuning);
    const site = world.camp.site;
    const eye = tuning.bodies.guard.eyeHeight.stand;
    const posts = world.camp.guards.map((g) => {
      routinePose(g.routine, 0, pose);
      return { x: pose.x, y: (g.elevated ? g.y : world.terrain.heightAt(pose.x, pose.z)) + eye, z: pose.z, g };
    });
    const seenBy = (x: number, z: number, who: (typeof posts)[number]): boolean => {
      const ground = world.terrain.heightAt(x, z);
      return nav.seesPoint(who.x, who.y, who.z, x, ground + 1.2, z) || nav.seesPoint(who.x, who.y, who.z, x, ground + tuning.bodies.player.height.stand, z);
    };
    const at = (a: number, b: number): { x: number; z: number } => ({ x: site.x + a * L.ux + b * L.vx, z: site.z + a * L.uz + b * L.vz });
    for (const o of L.openings) {
      if (found) break;
      // The way out, and the way along the wall, in the camp's frame.
      const na = o.side === 'front' ? 1 : o.side === 'back' ? -1 : 0;
      const nb = o.side === 'left' ? -1 : o.side === 'right' ? 1 : 0;
      const mid = at(o.a, o.b);
      const nx = na * L.ux + nb * L.vx;
      const nz = na * L.uz + nb * L.vz;
      for (const d of INSIDE) {
        if (found) break;
        const show = at(o.a - na * d, o.b - nb * d);
        if (!nav.standable(show.x, show.z)) continue;
        // In the view of a man on the ground who fights: he's what the scene waits for.
        if (!posts.some((p) => !p.g.elevated && tuning.brain.roles[p.g.role].fight > 0 && seenBy(show.x, show.z, p))) continue;
        const out = at(o.a + na * OFF_WALL, o.b + nb * OFF_WALL);
        // A straight walk out of it: an opening with something across it sends him round by another, and that's a different question.
        if (!nav.standable(out.x, out.z) || !nav.clear(show.x, show.z, out.x, out.z)) continue;
        for (const side of [1, -1]) {
          if (found) break;
          for (const r of ALONG) {
            // Along the wall is across the way out: the frame's other axis.
            const along = o.width / 2 + r;
            const hide = at(o.a + na * OFF_WALL + nb * side * along, o.b + nb * OFF_WALL + na * side * along);
            if (!nav.standable(hide.x, hide.z) || !nav.clear(out.x, out.z, hide.x, hide.z)) continue;
            if (posts.some((p) => seenBy(hide.x, hide.z, p))) continue;
            found = { show, faceX: -nx, faceZ: -nz, gate: { x: mid.x, z: mid.z, nx, nz, width: o.width }, out, hide, away: { x: hide.x + nx * AWAY, z: hide.z + nz * AWAY } };
            break;
          }
        }
      }
    }
  }
  leavings.set(world, found);
  return found;
}

/** Metres outside the opening that a sitting starts (`gate=1` on a live camp), nearest the one wanted first: a few seconds from it, with room to choose how to come at it. */
const START = [45, 50, 40, 55, 35, 60];

/**
 * Where a sitting about leaving a camp starts: a short way outside the opening `leavingOf`
 * finds, facing it, so what a person plays is the opening the scene and its experiment
 * measure. A camp whose wall hides nobody starts outside the opening nearest its middle.
 * Null for a camp with no openings, or with nowhere to stand outside this one.
 */
export function gateStart(world: World, tuning: Tuning): { x: number; z: number; faceX: number; faceZ: number } | null {
  const g = leavingOf(world, tuning)?.gate ?? openingNear(world, world.camp.site.x, world.camp.site.z);
  if (!g) return null;
  const nav = navigatorOf(world, tuning);
  for (const d of START) {
    const x = g.x + g.nx * d;
    const z = g.z + g.nz * d;
    if (nav.standable(x, z)) return { x, z, faceX: -g.nx, faceZ: -g.nz };
  }
  return null;
}
