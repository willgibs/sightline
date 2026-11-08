import type { Tuning } from '../../config/tuning';
import { bodyShape, bodyShapeAt, hasBody, queryBodies } from '../body';
import type { SimState } from '../kernel/state';
import type { QueryBody } from '../kernel/world/query';
import { emptyShape, type BodyShape } from '../kernel/world/shape';
import type { RemainsEntity } from './entities';

/**
 * The body a killed guard leaves (entities.ts, RemainsEntity): its shape at any instant,
 * a pure function of where and when he fell, so the simulation's sight lines and bullets
 * and the renderer's picture see the same body. He collapses from his pose when hit to
 * lying along the way the bullet went, accelerating as a fall does, over
 * tuning.ballistics.hits.collapseTime; the guard's own body shape (body lane) does the
 * rest, from standing through crouching to lying.
 */

/** How far down a body is at mission time `t`, 0 (as hit) to 1 (on the ground). */
export function collapse(r: RemainsEntity['remains'], t: number, tuning: Tuning): number {
  const T = tuning.ballistics.hits.collapseTime;
  const c = T > 0 ? (t - r.fell) / T : 1;
  return c <= 0 ? 0 : c >= 1 ? 1 : c * c;
}

/** The remains' shape at mission time `t`, written to `out`. */
export function remainsShape(r: RemainsEntity['remains'], t: number, tuning: Tuning, out: BodyShape): BodyShape {
  const spec = tuning.bodies.guard;
  const eye = r.eye + (spec.eyeHeight.prone - r.eye) * collapse(r, t, tuning);
  return bodyShape({ x: r.x, y: r.y, z: r.z, yaw: r.yaw, eyeHeight: eye, lean: 0, axis: r.yaw, lying: collapse(r, t, tuning), riseHead: 0, risePelvis: 0, riseFeet: 0 }, spec, out);
}

/**
 * Every shape a query sees, as it stands now (Game.bodies): each moving body, then each
 * body left behind, in entity order. Reuses `out` and its shapes.
 */
export function gameBodies(state: SimState, tuning: Tuning, out: QueryBody[]): QueryBody[] {
  queryBodies(state.entities, tuning, out);
  let n = out.length;
  const t = state.tick / tuning.sim.tickHz;
  for (const e of state.entities) {
    if (e.kind !== 'remains') continue;
    const q = (out[n++] ??= { id: 0, shape: emptyShape() });
    q.id = e.id;
    remainsShape(e.remains, t, tuning, q.shape);
  }
  out.length = n;
  return out;
}

/**
 * Every shape as it stood at mission time `t`, with "now" at `now` (both mission
 * seconds): each moving body between its poses (body lane, bodyShapeAt), each body left
 * behind at that instant, in the same order as gameBodies. What a bullet is swept
 * against, between two instants of a tick.
 */
export function bodiesAt(state: SimState, tuning: Tuning, now: number, t: number, out: QueryBody[]): QueryBody[] {
  const lag = (now - t) * tuning.sim.tickHz;
  let n = 0;
  for (const e of state.entities) {
    if (hasBody(e)) {
      const q = (out[n++] ??= { id: 0, shape: emptyShape() });
      q.id = e.id;
      bodyShapeAt(e.body, tuning.bodies[e.kind], lag, q.shape);
    }
  }
  for (const e of state.entities) {
    if (e.kind !== 'remains') continue;
    const q = (out[n++] ??= { id: 0, shape: emptyShape() });
    q.id = e.id;
    remainsShape(e.remains, t, tuning, q.shape);
  }
  out.length = n;
  return out;
}
