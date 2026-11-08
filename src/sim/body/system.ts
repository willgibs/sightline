import type { DebugDraw } from '../kernel/debugDraw';
import { Faction, type EntityId } from '../kernel/state';
import type { System, TickContext } from '../kernel/systems';
import { bodyHeight, hasBody, type BodySpec, type BodyState } from './body';
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
  if (!i) all.set(id, (i = { tick: 0, wishX: 0, wishZ: 0, gait: 'idle', yaw: 0, pitch: 0 }));
  return i;
}

/** Scratch: the other bodies the moving one collides with, rewritten for each body. */
const others: Cylinder[] = [];
const cylinders: Cylinder[] = [];
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
  emits: ['footstep', 'land'],
  run(ctx, dt) {
    const bodies = bodiesOf(ctx);
    for (let k = 0; k < bodies.length; k++) {
      const { id, faction, body, spec } = bodies[k]!;
      others.length = 0;
      for (let j = 0; j < bodies.length; j++) {
        if (j === k) continue;
        const o = bodies[j]!;
        const c = (cylinders[j] ??= { x: 0, y: 0, z: 0, radius: 0, height: 0 });
        c.x = o.body.x;
        c.y = o.body.y;
        c.z = o.body.z;
        c.radius = o.spec.radius;
        c.height = bodyHeight(o.body, o.spec);
        others.push(c);
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
