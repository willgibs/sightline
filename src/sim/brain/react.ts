import { DEG, dsin } from '../kernel/core/detmath';
import { turnTowards, wrapAngle, yawFromDirection } from '../kernel/core/math';
import type { GuardMind } from './mind';
import type { Order } from './orders';
import { keepRoutine } from './routine';

/**
 * The minimal reactions (A7): enough behaviour to show each state of the awareness ladder,
 * until lab E's brain replaces them. From his mind alone:
 * - unaware: keep to the routine (a guard who comes back rejoins it where it says);
 * - curious: stop, and look toward what caught his attention, turning if he must;
 * - suspicious: walk to where he believes it was, and look around there (from a tower,
 *   look around from it);
 * - searching: the same, briskly;
 * - combat: stand and face where he believes you are.
 * He turns at a body's rate and a head's rate, never in one tick.
 */
export function react(mind: GuardMind, out: Order): Order {
  const a = mind.awareness;
  if (a.state === 'unaware' || !a.focus) return keepRoutine(mind, out);
  const A = mind.tuning.perception.awareness;
  const hz = mind.tuning.sim.tickHz;
  const dt = 1 / hz;
  const self = mind.self;
  // Where he looks: his focus; in combat, where he believes you are.
  const tx = a.state === 'combat' && mind.belief ? mind.belief.x : a.fx;
  const tz = a.state === 'combat' && mind.belief ? mind.belief.z : a.fz;
  const dx = tx - self.x;
  const dz = tz - self.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const toward = dist > 1e-6 ? yawFromDirection(dx, dz) : self.yaw;
  const limit = A.headLimitDeg * DEG;
  let yaw = self.yaw;
  let wishX = 0;
  let wishZ = 0;
  let head: number;
  // A guard on a raised post (a tower) looks from it, and never walks off it.
  const going = (a.state === 'suspicious' || a.state === 'searching') && dist > A.arrive && !mind.post.elevated;
  if (going) {
    const speed = a.state === 'searching' ? A.hurry : A.approach;
    wishX = (dx / dist) * speed;
    wishZ = (dz / dist) * speed;
    yaw = turnTowards(self.yaw, toward, A.turnRate * dt);
    head = clamp(wrapAngle(toward - yaw), limit);
  } else {
    // Facing it: the head first, the body when the head can't reach.
    if (Math.abs(wrapAngle(toward - self.yaw)) > limit || a.state === 'combat') yaw = turnTowards(self.yaw, toward, A.turnRate * dt);
    head = a.state === 'combat' ? 0 : clamp(wrapAngle(toward - yaw), limit);
    // There, and nothing to see: look around.
    if (a.state === 'suspicious' || a.state === 'searching') {
      const t = (mind.tick - a.since) / hz;
      head = clamp(head + A.scanDeg * DEG * dsin((2 * Math.PI * t) / A.scanPeriod), limit);
    }
  }
  out.kind = 'move';
  out.tick = mind.tick;
  out.wishX = wishX;
  out.wishZ = wishZ;
  out.gait = going ? 'walk' : 'idle';
  out.yaw = yaw;
  out.pitch = 0;
  out.headYaw = turnTowards(mind.head, head, A.headRate * dt);
  return out;
}

function clamp(v: number, limit: number): number {
  return v > limit ? limit : v < -limit ? -limit : v;
}
