import type { Gait, MoveIntent } from '../body';

/**
 * Orders: how a brain steers its body. A brain decides in the 'decide' phase, after the
 * world has moved and been perceived, and its order moves the body from the next tick:
 * 'intent' carries out the current order every tick until the brain gives another. An
 * order is plain data, kept in the state tree on whoever was given it, so a run saved
 * between ticks resumes with every order in hand, and a body spawned mid-run starts with
 * its first.
 *
 * Today there is one kind, move: a wished velocity, gait and facing for the motor, and a
 * head turn. Lab E adds orders that carry over many ticks (go somewhere, follow a path,
 * hold and watch), each carried out here.
 */
export interface MoveOrder {
  kind: 'move';
  /** The tick it was decided for: the one after the decision. */
  tick: number;
  /** Wished horizontal velocity, m/s, as the motor takes it (MoveIntent). */
  wishX: number;
  wishZ: number;
  gait: Gait;
  /** Facing and view pitch to take. */
  yaw: number;
  pitch: number;
  /** Head turn relative to the body. */
  headYaw: number;
}

export type Order = MoveOrder;

/** An order to stand still where one stands, before any brain has decided. */
export function standStill(): Order {
  return { kind: 'move', tick: 0, wishX: 0, wishZ: 0, gait: 'idle', yaw: 0, pitch: 0, headYaw: 0 };
}

/**
 * Carries out an order for this tick: what the body intends, written to `out` for the
 * motor. Returns the head turn to take.
 */
export function carryOut(order: Order, tick: number, out: MoveIntent): number {
  out.tick = tick;
  out.wishX = order.wishX;
  out.wishZ = order.wishZ;
  out.gait = order.gait;
  out.yaw = order.yaw;
  out.pitch = order.pitch;
  return order.headYaw;
}
