import { Blocks, circleOverlaps, pushOutCircle } from '../kernel/world/colliders';
import type { Solids } from '../kernel/world/solids';
import { bodyHeight, groundBelow, type BodySpec, type BodyState, type Stance } from './body';
import { footprint, type FootCircle } from './chain';
import type { MotorContext } from './motor';

type StanceContext = Pick<MotorContext, 'world' | 'solids' | 'source' | 'emit'>;

/**
 * Starts a stance change, if the body can make it: standing up needs headroom, and a body
 * lying down needs it along its whole length, not only over its chest. A change into or
 * out of prone takes stanceTime.prone and can't be interrupted (`proneTransition`).
 * Returns whether the stance changed.
 */
export function requestStance(b: BodyState, to: Stance, spec: BodySpec, ctx: StanceContext): boolean {
  if (to === b.stance) return false;
  if (spec.height[to] > spec.height[b.stance] && (!hasHeadroom(b, spec.height[to], spec, ctx.solids) || (b.lying > 0 && !chainHasHeadroom(b, spec.height[to], spec, ctx)))) return false;
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

/**
 * True if every circle of a lying body's chain would still be clear with the body `height`
 * tall, judged as the invariant watch judges it: a body doesn't get up with its legs under
 * a shelf. A body's height is its stance's from the moment the stance changes, so this is
 * the only moment it can be refused.
 */
function chainHasHeadroom(b: BodyState, height: number, spec: BodySpec, ctx: StanceContext): boolean {
  const circles = footprint(b, spec, foot);
  for (let k = 0; k < circles.length; k++) {
    const C = circles[k]!;
    const cx = b.x + C.x;
    const cz = b.z + C.z;
    const base = Math.max(b.y - C.allow, groundBelow(ctx.world, ctx.solids, cx, cz, b.y + C.allow + spec.stepHeight, C.r).height);
    ctx.solids.query(cx - C.r, cz - C.r, cx + C.r, cz + C.r, ids);
    for (let q = 0; q < ids.length; q++) {
      const c = ctx.solids.get(ids[q]!);
      if ((c.flags & Blocks.Move) === 0 || c.y1 <= base + spec.stepHeight || c.y0 >= base + height) continue;
      if (pushOutCircle(c, cx, cz, C.r, push) && push.x * push.x + push.z * push.z > 1e-8) return false;
    }
  }
  return true;
}

const ids: number[] = [];
const push = { x: 0, z: 0 };
const foot: FootCircle[] = [];
