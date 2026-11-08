import { Blocks, circleOverlaps } from '../kernel/world/colliders';
import type { Solids } from '../kernel/world/solids';
import { bodyHeight, type BodySpec, type BodyState, type Stance } from './body';
import type { MotorContext } from './motor';

/**
 * Starts a stance change, if the body can make it: standing up needs headroom. A change
 * into or out of prone takes stanceTime.prone and can't be interrupted (`proneTransition`).
 * Returns whether the stance changed.
 */
export function requestStance(b: BodyState, to: Stance, spec: BodySpec, ctx: Pick<MotorContext, 'solids' | 'source' | 'emit'>): boolean {
  if (to === b.stance) return false;
  if (spec.height[to] > spec.height[b.stance] && !hasHeadroom(b, spec.height[to], spec, ctx.solids)) return false;
  const prone = to === 'prone' || b.stance === 'prone';
  ctx.emit({ type: 'stance', source: ctx.source, from: b.stance, to });
  b.eyeFrom = b.eyeHeight;
  b.stance = to;
  b.stanceDuration = prone ? spec.stanceTime.prone : spec.stanceTime.crouch;
  b.stanceTimer = b.stanceDuration;
  // An instant change (a zero stance time) has no transition to wait out.
  b.proneTransition = prone && b.stanceDuration > 0;
  return true;
}

/** True if nothing solid sits between the body's current top and `height` above its feet. */
function hasHeadroom(b: BodyState, height: number, spec: BodySpec, solids: Solids): boolean {
  const r = spec.radius;
  const current = bodyHeight(b, spec);
  solids.query(b.x - r, b.z - r, b.x + r, b.z + r, ids);
  for (let q = 0; q < ids.length; q++) {
    const c = solids.get(ids[q]!);
    if ((c.flags & Blocks.Move) === 0) continue;
    // Same comparisons as moving: a slab exactly at head height is overhead, not in the way.
    if (c.y0 < b.y + current - 0.01 || c.y0 >= b.y + height) continue;
    if (circleOverlaps(c, b.x, b.z, r)) return false;
  }
  return true;
}

const ids: number[] = [];
