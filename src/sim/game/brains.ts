import { createBrain, firefightPhase, huntPhase, type TaskKind } from '../brain';
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
/** An order about the target, in the debug view's words: the rest are named by what the man is seen to do. */
const ERRANDS: Partial<Record<TaskKind, string>> = {
  'start': 'to start his vehicle',
  'fetch': 'in for the target',
  'escort': 'to his vehicle with him',
  'post': 'to hold his door',
};

/** Seconds a man's label says he's holding his fire, after he has. */
const HELD_SHOWN = 2;

export function drawBrain(draw: DebugDraw, ctx: TickContext, g: GuardEntity): void {
  const b = g.brain;
  if (!b) return;
  const body = g.body;
  const h = ctx.world.terrain.heightAt.bind(ctx.world.terrain);
  const ground = (x: number, z: number): number => h(x, z) + 0.15;
  const a = g.senses?.awareness.state ?? 'unaware';
  const tone = a === 'combat' ? 'bad' : a === 'searching' ? 'warn' : a === 'unaware' ? 'muted' : 'info';
  // What he's on, for a man in a fight, on a hunt, or on an errand about the target (brain/protect.ts): the part he's at, or what the errand is.
  const errand = b.act === 'task' && b.task ? ERRANDS[b.task.kind] : undefined;
  const phase = firefightPhase(b, ctx.tick) ?? huntPhase(b, ctx.tick) ?? (errand ? (b.task!.kind === 'start' && b.engine ? 'by the vehicle, engine running' : errand) : null);
  // He had a shot and didn't take it: one of his own was in front of his rifle (game/combat.ts). Shown for a moment after, since the moment itself is one tick.
  const holding = b.held !== undefined && (ctx.tick - b.held) / ctx.tuning.sim.tickHz <= HELD_SHOWN ? ' · holding his fire' : '';
  draw.label(body.x, body.y + body.eyeHeight + 0.95, body.z, `${phase ? `${b.act} · ${phase}` : b.act}${holding}`, tone, `${b.act}${phase ? ` (${phase})` : ''} · ${a}${b.linger >= 0 ? ' · looking around' : ''}${holding ? ' · holding his fire: one of his own is in front of his rifle' : ''}`);
  // A firefight: where he believes the intruder is, and his position: where he hides, and where he fires from.
  const ff = b.ff;
  if (ff && phase) {
    draw.line(body.x, body.y + body.eyeHeight, body.z, ff.x, ff.y, ff.z, ff.own ? 'bad' : 'warn');
    draw.circle(ff.x, ground(ff.x, ff.z), ff.z, Math.max(0.5, ff.r), 'bad');
    const s = ff.spot;
    if (s) {
      draw.point(s.hx, ground(s.hx, s.hz), s.hz, 0.25, 'good');
      if (s.fx !== s.hx || s.fz !== s.hz) draw.line(s.hx, ground(s.hx, s.hz), s.hz, s.fx, ground(s.fx, s.fz), s.fz, s.line ? 'good' : 'muted');
      draw.point(s.fx, ground(s.fx, s.fz) + (s.fs === 'stand' ? 1.2 : 0.6), s.fz, 0.15, s.line ? 'good' : 'muted');
    }
  }
  // A hunt: the way out as its stops, in view (warn) or out of it, the one he's on or making for, and the place.
  const hunt = b.hunt;
  if (hunt && b.act === 'hunt') {
    for (let k = 0; k < hunt.lit.length; k++) {
      const x = hunt.stops[2 * k]!;
      const z = hunt.stops[2 * k + 1]!;
      if (k > 0) draw.line(hunt.stops[2 * k - 2]!, ground(hunt.stops[2 * k - 2]!, hunt.stops[2 * k - 1]!), hunt.stops[2 * k - 1]!, x, ground(x, z), z, hunt.lit[k] === 1 ? 'warn' : 'good');
      draw.point(x, ground(x, z), z, k === hunt.at ? 0.4 : 0.2, k === hunt.at ? 'info' : hunt.lit[k] === 1 ? 'warn' : 'good');
    }
    draw.circle(hunt.ox, ground(hunt.ox, hunt.oz), hunt.oz, ctx.tuning.brain.hunt.sweep.radius, 'bad');
  }
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
