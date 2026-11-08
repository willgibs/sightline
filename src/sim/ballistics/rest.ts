import type { Tuning } from '../../config/tuning';
import type { BodyState } from '../body';
import { dcos, dsin, DEG } from '../kernel/core/detmath';
import { Blocks, circleOverlaps } from '../kernel/world/colliders';
import type { Solids } from '../kernel/world/solids';
import type { World } from '../kernel/world/world';

/**
 * Whether the rifle can rest on something where the shooter is aiming: what makes prone
 * and a sandbag steadier than a free hand (design doc · Sway: resting on a surface helps).
 * Found by geometry, never declared: under the rifle's fore-end, a little ahead of the
 * eye along the aim, there must be a surface a little below the line of sight.
 *
 * - Prone, the bipod: the ground (terrain or the top of something solid) within reach
 *   below the fore-end, and the aim near level (a bipod can't point far up or down).
 * - Crouched or standing: the top of something solid (a sandbag, a wall, a sill) or a
 *   bank of terrain just under the fore-end.
 *
 * A body changing stance has no rest until the change is done.
 */
export function restAvailable(
  world: World,
  solids: Solids,
  body: Pick<BodyState, 'x' | 'y' | 'z' | 'stance' | 'eyeHeight' | 'stanceTimer' | 'proneTransition'>,
  eye: { x: number; y: number; z: number },
  yaw: number,
  pitch: number,
  S: Tuning['ballistics']['sway'],
): boolean {
  if (body.stanceTimer > 0 || body.proneTransition) return false;
  const prone = body.stance === 'prone';
  if (prone && Math.abs(pitch) > S.bipodPitchDeg * DEG) return false;
  const reach = prone ? S.restReach.prone : S.restReach.upright;
  const [lo, hi] = prone ? S.restBand.prone : S.restBand.upright;
  const cp = dcos(pitch);
  if (cp < 0.2) return false;
  const fx = eye.x - dsin(yaw) * reach;
  const fz = eye.z - dcos(yaw) * reach;
  // The line of sight's height over the fore-end.
  const sight = eye.y + (reach * dsin(pitch)) / cp;
  const top = supportBelow(world, solids, fx, fz, sight - lo);
  const gap = sight - top;
  return gap >= lo && gap <= hi;
}

const ids: number[] = [];

/** The highest surface at (x, z) no higher than `below`: the terrain, or the top of something solid there. */
function supportBelow(world: World, solids: Solids, x: number, z: number, below: number): number {
  let top = world.terrain.heightAt(x, z);
  const r = 0.04;
  solids.query(x - r, z - r, x + r, z + r, ids);
  for (let q = 0; q < ids.length; q++) {
    const c = solids.get(ids[q]!);
    if ((c.flags & Blocks.Move) === 0 || c.y1 > below || c.y1 <= top) continue;
    if (circleOverlaps(c, x, z, r)) top = c.y1;
  }
  return top;
}
