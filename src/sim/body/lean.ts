import { circleOverlaps, Blocks } from '../kernel/world/colliders';
import { emptyShape } from '../kernel/world/shape';
import type { BodySpec, BodyState } from './body';
import type { MotorContext, MoveIntent } from './motor';
import { bodyShape, hipHeight } from './shape';

/**
 * Leaning around cover. The head (and with it the eye: the eye is the centre of the head
 * that guards target) moves sideways about the hips, and the shoulders follow; the
 * shape everyone sees and shoots at moves with it, so nothing about a lean is hidden.
 * Rate-limited, so a lean can't be flicked, and held clear of the world and other bodies
 * by sweeping the head and the shoulders each tick.
 *
 * With nothing raised, a lean is a peek: an eye past the corner. With an optic up it goes
 * far enough to clear the corner, the distinction Ground Branch draws.
 *
 * What the motor promises (motor.ts, the invariants): the leaning head and shoulders
 * never end a tick inside anything solid or the terrain, and the lean grows by no more
 * than `rate × dt` in a tick (the world can force it back faster).
 */

const shape = emptyShape();
const pose = { x: 0, y: 0, z: 0, yaw: 0, eyeHeight: 0, lean: 0, axis: 0, lying: 0, riseHead: 0, risePelvis: 0, riseFeet: 0 };
const ids: number[] = [];

/** How far the eye may go aside right now, metres: by what's raised and how the body stands. */
export function leanReach(b: BodyState, spec: BodySpec, raised: boolean): number {
  const L = spec.lean;
  const want = raised ? L.weapon : L.peek;
  const E = spec.eyeHeight;
  if (b.eyeHeight < E.crouch) return want < L.prone ? want : L.prone;
  const spine = b.eyeHeight - hipHeight(b.eyeHeight, spec);
  const bent = L.bend * spine;
  return want < bent ? want : bent;
}

/** True if a sphere is clear of the terrain, anything solid and other bodies. */
function sphereClear(x: number, y: number, z: number, r: number, ctx: MotorContext): boolean {
  if (y - r < ctx.world.terrain.heightAt(x, z)) return false;
  ctx.solids.query(x - r, z - r, x + r, z + r, ids);
  for (let q = 0; q < ids.length; q++) {
    const c = ctx.solids.get(ids[q]!);
    if ((c.flags & Blocks.Move) === 0 || c.y1 <= y - r || c.y0 >= y + r) continue;
    if (circleOverlaps(c, x, z, r)) return false;
  }
  for (let k = 0; k < ctx.others.length; k++) {
    const o = ctx.others[k]!;
    if (o.y >= y + r || o.y + o.height <= y - r) continue;
    const dx = x - o.x;
    const dz = z - o.z;
    const rr = r + o.radius;
    if (dx * dx + dz * dz < rr * rr) return false;
  }
  return true;
}

/** True if a body leaned this far has its head and shoulders clear. */
function leanClear(b: BodyState, lean: number, spec: BodySpec, ctx: MotorContext): boolean {
  pose.x = b.x;
  pose.y = b.y;
  pose.z = b.z;
  pose.yaw = b.yaw;
  pose.eyeHeight = b.eyeHeight;
  pose.lean = lean;
  pose.axis = b.axis;
  pose.lying = b.lying;
  pose.riseHead = b.riseHead;
  pose.risePelvis = b.risePelvis;
  pose.riseFeet = b.riseFeet;
  const s = bodyShape(pose, spec, shape);
  const t = s.torso;
  // Below a crouch only the head moves (shape.ts, applyLean), and the shoulders' sphere rests
  // exactly on the ground: asking whether it's clear would be decided by the last bit of a float.
  return sphereClear(s.head.x, s.head.y, s.head.z, s.head.r, ctx) && (b.eyeHeight < spec.eyeHeight.crouch || sphereClear(t.bx, t.by, t.bz, t.r, ctx));
}

const BISECTIONS = 8;

/**
 * One tick of the lean: toward what's wanted, at its rate, and only as far as the head
 * and shoulders stay clear. A body moving into a wall, or turning its lean into one,
 * gives the lean up as far as it has to, however fast.
 */
export function stepLean(b: BodyState, i: MoveIntent, spec: BodySpec, ctx: MotorContext): void {
  const on = b.motor === 'ground' && !b.sliding && i.gait !== 'sprint';
  const want = on ? i.lean * leanReach(b, spec, i.raised) : 0;
  const step = spec.lean.rate * ctx.dt;
  let next = b.lean;
  if (next < want) next = next + step < want ? next + step : want;
  else if (next > want) next = next - step > want ? next - step : want;
  if (next === 0) {
    b.lean = 0;
    return;
  }
  if (leanClear(b, next, spec, ctx)) {
    b.lean = next;
    return;
  }
  // Blocked. Where it is now still clear, go as far as is clear from there; where the body
  // has moved or turned the lean into something, take it back toward upright until clear.
  let lo = 0;
  let hi = next;
  if (b.lean !== 0 && Math.sign(b.lean) === Math.sign(next) && Math.abs(b.lean) < Math.abs(next) && leanClear(b, b.lean, spec, ctx)) lo = b.lean;
  for (let k = 0; k < BISECTIONS; k++) {
    const mid = (lo + hi) / 2;
    if (leanClear(b, mid, spec, ctx)) lo = mid;
    else hi = mid;
  }
  b.lean = lo;
}
