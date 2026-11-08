import type { DebugDraw } from '../kernel/debugDraw';
import { Faction, type EntityId } from '../kernel/state';
import type { System, TickContext } from '../kernel/systems';
import { bodyHeight, hasBody, type BodySpec, type BodyState } from './body';
import { footprint, type FootCircle } from './chain';
import { idleIntent, stepMotor, type Cylinder, type MoveIntent } from './motor';

/**
 * The body lane's place in a tick. Whatever steers a body (the player's controls, a
 * guard's orders) writes its intent for the tick into the `@intents` channel during
 * 'intent'; the motor system then moves every body by its intent, or holds it still if
 * it has none this tick.
 */

/** This tick's intents, by entity id: written in 'intent', read by the motor (TickContext.channel). */
export function intents(ctx: TickContext): Map<EntityId, MoveIntent> {
  return ctx.channel('intents', () => new Map<EntityId, MoveIntent>());
}

/** The intent of one body for this tick, to fill in: made the first time it is asked for. */
export function intentFor(ctx: TickContext, id: EntityId): MoveIntent {
  const all = intents(ctx);
  let i = all.get(id);
  if (!i) all.set(id, (i = { tick: 0, wishX: 0, wishZ: 0, gait: 'idle', yaw: 0, pitch: 0, lean: 0, raised: false, climb: false, climbAxis: 0, load: 1, scrape: false }));
  return i;
}

/** Scratch: the other bodies the moving one collides with, rewritten for each body. */
const others: Cylinder[] = [];
const cylinders: Cylinder[] = [];
const circles: FootCircle[] = [];
const bodies: Array<{ id: EntityId; faction: number; body: BodyState; spec: BodySpec }> = [];

/** Every body in entity order, with its kind's spec. */
function bodiesOf(ctx: TickContext): typeof bodies {
  bodies.length = 0;
  for (const e of ctx.state.entities) if (hasBody(e)) bodies.push({ id: e.id, faction: e.faction, body: e.body, spec: ctx.tuning.bodies[e.kind] });
  return bodies;
}

/** Every body, in entity order, each against where the others are at that moment. */
export const motorSystem: System = {
  name: 'motor',
  phase: 'motor',
  reads: ['@intents', 'solid.solid'],
  writes: ['*.body'],
  emits: ['footstep', 'land', 'mantle', 'stance', 'drag'],
  run(ctx, dt) {
    const bodies = bodiesOf(ctx);
    for (let k = 0; k < bodies.length; k++) {
      const { id, faction, body, spec } = bodies[k]!;
      others.length = 0;
      let n = 0;
      for (let j = 0; j < bodies.length; j++) {
        if (j === k) continue;
        const o = bodies[j]!;
        // A lying body stands in the way along its whole length.
        const foot = footprint(o.body, o.spec, circles);
        for (let f = 0; f < foot.length; f++) {
          const C = foot[f]!;
          const c = (cylinders[n++] ??= { x: 0, y: 0, z: 0, radius: 0, height: 0 });
          c.x = o.body.x + C.x;
          c.y = o.body.y + C.rise;
          c.z = o.body.z + C.z;
          c.radius = C.r;
          c.height = bodyHeight(o.body, o.spec);
          others.push(c);
        }
      }
      let intent = intentFor(ctx, id);
      if (intent.tick !== ctx.tick) intent = idleIntent(body, ctx.tick, intent);
      // The controller overlay in the debug view, for the player's side.
      let draw: DebugDraw | null = null;
      if (faction === Faction.Player) ctx.debug((d) => (draw = d));
      stepMotor(body, intent, spec, { world: ctx.world, solids: ctx.solids, tuning: ctx.tuning, dt, tick: ctx.tick, source: id, others, emit: ctx.emit, draw });
      ctx.work.bodies++;
    }
  },
};
