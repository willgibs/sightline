import { createBrain } from '../brain';
import type { DebugDraw } from '../kernel/debugDraw';
import type { TickContext } from '../kernel/systems';
import type { GuardEntity } from './entities';
import type { Simulation } from './sim';

/** Gives every guard a brain (lab E): a scene's setup, where the camp brain runs. */
export function giveBrains(sim: Simulation): void {
  for (const g of sim.guards) g.brain ??= createBrain();
}

/**
 * A guard's brain in the debug view: what he's doing, why and because of what, over his
 * head; the route he's walking, its next waypoint and where the act points.
 */
export function drawBrain(draw: DebugDraw, ctx: TickContext, g: GuardEntity): void {
  const b = g.brain;
  if (!b) return;
  const body = g.body;
  const h = ctx.world.terrain.heightAt.bind(ctx.world.terrain);
  const ground = (x: number, z: number): number => h(x, z) + 0.15;
  const a = g.senses?.awareness.state ?? 'unaware';
  const tone = a === 'combat' ? 'bad' : a === 'searching' ? 'warn' : a === 'unaware' ? 'muted' : 'info';
  draw.label(body.x, body.y + body.eyeHeight + 0.95, body.z, `${b.act} · ${a}${b.linger >= 0 ? ' · looking around' : ''}`, tone);
  // The route: from him through what's left of it.
  let px = body.x;
  let pz = body.z;
  const pts = b.route.points;
  for (let i = b.route.next * 2; i + 1 < pts.length; i += 2) {
    const x = pts[i]!;
    const z = pts[i + 1]!;
    draw.line(px, ground(px, pz), pz, x, ground(x, z), z, i === b.route.next * 2 ? 'info' : 'muted');
    px = x;
    pz = z;
  }
  if (b.act !== 'routine') draw.point(b.x, ground(b.x, b.z), b.z, 0.2, tone);
  if (b.route.sideUntil >= ctx.tick) draw.circle(body.x, ground(body.x, body.z), body.z, 0.8, 'warn');
}
