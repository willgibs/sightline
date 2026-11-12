import type { Simulation } from '../sim/game/sim';
import { dcos, dsin } from '../sim/kernel/core/detmath';
import { Blocks } from '../sim/kernel/world/colliders';
import { emptyHit, raycast, sightLine } from '../sim/kernel/world/query';

/**
 * Where a scripted shooter lies: places a prone eye has a clear line from. The lab's
 * experiments and the headless sitting share them, so "from the best overview" and "from
 * 90 m" mean the same place wherever a number comes from.
 */

export interface Point {
  x: number;
  y: number;
  z: number;
}

/** How far round from the wanted bearing a close firing point is looked for, a step at a time, one side then the other. */
const ROUND = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8, -8, 9, -9];
const STEP_DEG = 20;

/** The camp's best overview, with a prone shooter's eye on it. */
export function overviewEye(sim: Simulation): Point {
  const list = [...(sim.world.report.camp!.perches as ReadonlyArray<{ x: number; z: number; coverage: number }>)].sort((a, b) => b.coverage - a.coverage || a.x - b.x || a.z - b.z); // the coordinates break a tie
  const p = list[0]!;
  return { x: p.x, y: sim.world.terrain.heightAt(p.x, p.z) + sim.tuning.bodies.player.eyeHeight.prone, z: p.z };
}

/** True if nothing solid stands between two points: sight and a bullet both get through. */
export function clearLine(sim: Simulation, from: Point, to: Point): boolean {
  return sightLine({ world: sim.world, solids: sim.solids, bodies: [] }, from.x, from.y, from.z, to.x, to.y, to.z, Blocks.Sight | Blocks.Bullet);
}

const hit = emptyHit();

/**
 * True if a round fired from one point at another meets nothing before it gets there but
 * the thing aimed at: `own` is that thing's colliders, for a point inside something solid
 * (a generator's middle).
 */
export function clearShot(sim: Simulation, from: Point, to: Point, own: readonly number[] = []): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d < 1e-6) return true;
  raycast({ world: sim.world, solids: sim.solids, bodies: [] }, from.x, from.y, from.z, dx / d, dy / d, dz / d, d, Blocks.Sight | Blocks.Bullet, hit);
  return hit.what === 'none' || (hit.what === 'collider' && own.includes(hit.id));
}

/**
 * A prone shooter's eye `range` metres from a point with a clear line to it: toward
 * `toward` if that's open, else the nearest bearing round from it that is. Null if every
 * bearing tried is shut. `own` is as `clearShot` takes it.
 */
export function closeTo(sim: Simulation, at: Point, toward: Point, range: number, own: readonly number[] = []): Point | null {
  const dx = toward.x - at.x;
  const dz = toward.z - at.z;
  const d = Math.sqrt(dx * dx + dz * dz) || 1;
  for (const k of ROUND) {
    const a = (k * STEP_DEG * Math.PI) / 180;
    const c = dcos(a);
    const s = dsin(a);
    const x = at.x + ((dx * c - dz * s) / d) * range;
    const z = at.z + ((dx * s + dz * c) / d) * range;
    const from = { x, y: sim.world.terrain.heightAt(x, z) + sim.tuning.bodies.player.eyeHeight.prone, z };
    if (own.length > 0 ? clearShot(sim, from, at, own) : clearLine(sim, from, at)) return from;
  }
  return null;
}
