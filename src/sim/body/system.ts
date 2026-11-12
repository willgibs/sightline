import type { DebugDraw } from '../kernel/debugDraw';
import { Faction, type EntityId } from '../kernel/state';
import type { System, TickContext } from '../kernel/systems';
import { bodyHeight, hasBody, type BodySpec, type BodyState } from './body';
import { footprint, type FootCircle } from './chain';
import { idleIntent, stepFree, stepPath, type Cylinder, type MotorContext, type MoveIntent } from './motor';

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
const bodies: Array<{ id: EntityId; faction: number; body: BodyState; spec: BodySpec; path: boolean }> = [];

/** Every body in entity order, with its kind's spec. */
function bodiesOf(ctx: TickContext): typeof bodies {
  bodies.length = 0;
  for (const e of ctx.state.entities) if (hasBody(e)) bodies.push({ id: e.id, faction: e.faction, body: e.body, spec: ctx.tuning.bodies[e.kind], path: false });
  return bodies;
}

/** Every body but the `k`th, as the cylinders it stands in the way as, where each is at this moment. */
function othersOf(k: number): Cylinder[] {
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
  return others;
}

/**
 * Every body, each against where the others are at that moment, in two passes. First, in
 * entity order, every body that walks or falls: those can be shoved, so who goes before
 * whom only decides who gives way. Then, in entity order, every body on a path of its own
 * (a mantle, a ladder): a path can't give way, so it takes a pose only where that pose is
 * clear of every other body, and it has to be asking about where they end the tick. Moved
 * in its turn among the walkers, the player on a ladder was asking where each guard had
 * been, and one of them then stepped up onto a box under him (the fuzz run's tower
 * RES-2063-3, Nov 12).
 */
export const motorSystem: System = {
  name: 'motor',
  phase: 'motor',
  reads: ['@intents', 'solid.solid'],
  writes: ['*.body'],
  emits: ['footstep', 'land', 'mantle', 'stance', 'drag'],
  run(ctx, dt) {
    const bodies = bodiesOf(ctx);
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k < bodies.length; k++) {
        const it = bodies[k]!;
        if (pass === 1 && !it.path) continue;
        const { id, faction, body, spec } = it;
        let intent = intentFor(ctx, id);
        if (intent.tick !== ctx.tick) intent = idleIntent(body, ctx.tick, intent);
        // The controller overlay in the debug view, for the player's side.
        let draw: DebugDraw | null = null;
        if (faction === Faction.Player) ctx.debug((d) => (draw = d));
        const motor: MotorContext = { world: ctx.world, solids: ctx.solids, tuning: ctx.tuning, dt, tick: ctx.tick, source: id, others: othersOf(k), emit: ctx.emit, draw };
        if (pass === 0) {
          it.path = stepFree(body, intent, spec, motor);
          ctx.work.bodies++;
        } else stepPath(body, intent, spec, motor);
      }
    }
  },
};
