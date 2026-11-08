import { routinePose, type RoutinePose } from '../generation';
import type { GuardMind } from './mind';
import type { Order } from './orders';

/**
 * The simplest brain: keep to the routine (generation/routine.ts), a pure function of
 * mission time. Each tick, it orders him to be where the routine puts him at the end of
 * the next: the routine's own velocity, plus whatever closes a gap he has fallen behind
 * (shoved, or slowed by a slope), no faster than he may hurry. Labs A and E add brains that can pull a guard off
 * his routine; one who returns rejoins it where it says he should be.
 */

const pose: RoutinePose = { x: 0, z: 0, yaw: 0, headYaw: 0, moving: false, vx: 0, vz: 0 };

export function keepRoutine(mind: GuardMind, out: Order): Order {
  const { self, tuning } = mind;
  const dt = 1 / tuning.sim.tickHz;
  routinePose(mind.post.routine, mind.time, pose);
  // Exactly the routine's velocity when on schedule; more, toward it, when behind.
  let wx = (pose.x - self.x) / dt;
  let wz = (pose.z - self.z) / dt;
  const cap = tuning.bodies.guard.speed.walk * tuning.guards.catchUp;
  const w = Math.sqrt(wx * wx + wz * wz);
  if (w > cap) {
    wx *= cap / w;
    wz *= cap / w;
  }
  // A few millimetres off is standing still, not walking.
  const walking = pose.moving || w > 0.05;
  out.kind = 'move';
  out.tick = mind.tick;
  out.wishX = walking ? wx : 0;
  out.wishZ = walking ? wz : 0;
  out.gait = walking ? 'walk' : 'idle';
  out.yaw = pose.yaw;
  out.pitch = 0;
  out.headYaw = pose.headYaw;
  return out;
}
