import type { Tuning } from '../../config/tuning';
import type { World } from '../gen/world';
import { routinePose, type RoutinePose } from '../gen/routine';
import { createBody, type BodyState } from '../motor/body';
import type { MoveIntent } from '../motor/motor';

/**
 * Guards, before Phase 1 gives them senses and a brain: each keeps to his routine
 * (gen/routine.ts), a pure function of mission time, and moves with the shared motor
 * like the player, so he collides with the world, steps, slopes and makes footsteps
 * under the same rules. Labs A and E add perception and the brain that can pull a
 * guard off his routine; a guard who returns rejoins it where it says he should be.
 */
export interface GuardState {
  /** Which of the camp's guard spawns (world.camp.guards) this guard came from. */
  spawn: number;
  /** Head turn relative to the body. */
  headYaw: number;
}

/** A guard's starting state, from the camp's spawn at `index`: on his post, or on the deck of his tower. */
export function createGuard(world: World, index: number, tuning: Tuning): { body: BodyState; guard: GuardState } {
  const s = world.camp.guards[index]!;
  const body = createBody(world, tuning.bodies.guard, s.x, s.z, s.faceX, s.faceZ, s.y);
  return { body, guard: { spawn: index, headYaw: 0 } };
}

const pose: RoutinePose = { x: 0, z: 0, yaw: 0, headYaw: 0, moving: false, vx: 0, vz: 0 };

/**
 * What a guard on routine wants this tick: to be where his routine puts him at the end
 * of it. The routine's own velocity, plus whatever closes the gap he has fallen behind
 * (shoved, or slowed by a slope), no faster than he may hurry.
 */
export function guardIntent(body: BodyState, guard: GuardState, world: World, tuning: Tuning, tick: number, out: MoveIntent): MoveIntent {
  const routine = world.camp.guards[guard.spawn]!.routine;
  const dt = 1 / tuning.sim.tickHz;
  routinePose(routine, tick / tuning.sim.tickHz, pose);
  // Exactly the routine's velocity when on schedule; more, toward it, when behind.
  let wx = (pose.x - body.x) / dt;
  let wz = (pose.z - body.z) / dt;
  const cap = tuning.bodies.guard.speed.walk * tuning.guards.catchUp;
  const w = Math.sqrt(wx * wx + wz * wz);
  if (w > cap) {
    wx *= cap / w;
    wz *= cap / w;
  }
  // A few millimetres off is standing still, not walking.
  const walking = pose.moving || w > 0.05;
  out.tick = tick;
  out.wishX = walking ? wx : 0;
  out.wishZ = walking ? wz : 0;
  out.gait = walking ? 'walk' : 'idle';
  out.yaw = pose.yaw;
  out.pitch = 0;
  guard.headYaw = pose.headYaw;
  return out;
}
