import type { Tuning } from '../../config/tuning';
import { dcos, dsin } from '../kernel/core/detmath';
import type { EntityIndex } from '../kernel/state';
import type { System, TickContext } from '../kernel/systems';
import { Blocks, circleOverlaps, type RayHit } from '../kernel/world/colliders';
import type { Solids } from '../kernel/world/solids';
import { groundBelow } from '../body';
import { foliageOf } from '../perception';
import { player, type PlayerEntity, type RemainsEntity } from './entities';

/**
 * The use action (C6): the press that acts on what's in front of the player. Today it
 * picks up a body and puts it down (lab B's `remains`); lab E's sabotage and opening
 * doors will take their place on the same press.
 *
 * Carried standing, the body rides the shoulder; crouched, it is dragged along the ground
 * behind. Both are slow, and dragging scrapes, loudest on gravel and metal. Put down in
 * foliage or by a container, it is hidden: where guards' eyes (and the shots they'd fire)
 * see nothing there. Hands full: no mantling or ladders until it's put down.
 */

const hit: RayHit = { dist: Infinity, id: -1 };

/**
 * The body a press would pick up: the nearest one within reach, in front of the player,
 * on about the player's level, with nothing solid between the eye and it, if the hands are
 * free to.
 */
export function bodyInReach(p: PlayerEntity, index: EntityIndex, tuning: Tuning, solids: Solids): RemainsEntity | null {
  const b = p.body;
  if (b.motor !== 'ground' || b.stance === 'prone' || b.proneTransition) return null;
  const C = tuning.bodies.player.carry;
  const reach = C.reach;
  const fx = -dsin(b.yaw);
  const fz = -dcos(b.yaw);
  let best: RemainsEntity | null = null;
  let bestD = reach;
  for (const e of index.of('remains')) {
    const r = e.remains;
    if (r.carriedBy !== 0) continue;
    const dx = r.x - b.x;
    const dz = r.z - b.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d >= bestD) continue;
    if (d > C.underfoot && (fx * dx + fz * dz) / d < C.facingCos) continue; // behind, or off to the side
    if (Math.abs(r.y - b.y) > C.reachHeight) continue; // on a deck overhead, or below
    const dy = r.y + C.grabAt - (b.y + b.eyeHeight);
    const line = Math.sqrt(d * d + dy * dy);
    solids.raycast(b.x, b.y + b.eyeHeight, b.z, dx / line, dy / line, dz / line, line, Blocks.Move, hit);
    if (hit.id >= 0) continue; // through a wall
    best = e;
    bestD = d;
  }
  return best;
}

/** What a press of use would do now: the prompt. */
export function usePrompt(p: PlayerEntity, index: EntityIndex, tuning: Tuning, solids: Solids): '' | 'carry' | 'drop' {
  if (p.control.carrying !== 0) return 'drop';
  return bodyInReach(p, index, tuning, solids) ? 'carry' : '';
}

/** Is this spot somewhere a body stays hidden: inside foliage, or beside a container? */
function hides(ctx: TickContext, x: number, z: number): boolean {
  const C = ctx.tuning.bodies.player.carry;
  const foliage = foliageOf(ctx.world);
  for (const v of foliage.volumes) {
    const dx = x - v.x;
    const dz = z - v.z;
    if (dx * dx + dz * dz <= v.r * v.r && v.y0 <= ctx.world.terrain.heightAt(x, z) + C.hideBelow) return true;
  }
  for (const s of ctx.world.camp.structures) {
    if (s.kind !== 'container') continue;
    for (const id of s.colliders) {
      if (circleOverlaps(ctx.solids.get(id), x, z, C.hideBy)) return true;
    }
  }
  return false;
}

/** The ground a body lies on at (x, z), for a carrier with its feet at `y`: what's underfoot there, not only the terrain. */
function groundAt(ctx: TickContext, x: number, z: number, y: number): number {
  const spec = ctx.tuning.bodies.player;
  return groundBelow(ctx.world, ctx.solids, x, z, y + spec.stepHeight, spec.radius).height;
}

/** A press of use: picks up what's in reach, or puts down what's carried, lying the way the carrier faces. */
export const useSystem: System = {
  name: 'use',
  phase: 'commands',
  after: ['rifle', 'sandbox-drops'],
  reads: ['input', 'player.body', 'player.control', 'remains.remains', 'solid.solid'],
  writes: ['player.control', 'remains.remains'],
  emits: [],
  run(ctx) {
    if (!ctx.input.commands.some((c) => c.kind === 'use')) return;
    const p = player(ctx.index);
    const b = p.body;
    if (p.control.carrying !== 0) {
      const e = ctx.index.get(p.control.carrying);
      p.control.carrying = 0;
      if (e?.kind !== 'remains') return;
      const r = e.remains;
      r.carriedBy = 0;
      // Off the shoulder it comes down at the carrier's feet; dragged, it stays where it trails.
      if (b.stance === 'stand') {
        r.x = b.x;
        r.z = b.z;
      }
      r.y = groundAt(ctx, r.x, r.z, b.y);
      r.yaw = b.yaw;
      r.fell = ctx.tick / ctx.tuning.sim.tickHz - ctx.tuning.ballistics.hits.collapseTime;
      r.hidden = hides(ctx, r.x, r.z);
      return;
    }
    const target = bodyInReach(p, ctx.index, ctx.tuning, ctx.solids);
    if (!target) return;
    target.remains.carriedBy = p.id;
    target.remains.hidden = false;
    p.control.carrying = target.id;
  },
};

/** A carried body follows its carrier: on the shoulder, or dragged behind along the ground. */
export const carriedSystem: System = {
  name: 'carried',
  phase: 'motor',
  after: ['motor'],
  reads: ['player.body', 'player.control', 'solid.solid'],
  writes: ['remains.remains'],
  emits: [],
  run(ctx) {
    const p = player(ctx.index);
    if (p.control.carrying === 0) return;
    const e = ctx.index.get(p.control.carrying);
    if (e?.kind !== 'remains') {
      p.control.carrying = 0;
      return;
    }
    const b = p.body;
    const r = e.remains;
    const C = ctx.tuning.bodies.player.carry;
    r.yaw = b.yaw;
    if (b.stance === 'stand') {
      r.x = b.x;
      r.y = b.y + C.shoulder;
      r.z = b.z;
    } else {
      // Dragged: trailing behind, along the ground, and no further than the first thing in the way.
      const fx = -dsin(b.yaw);
      const fz = -dcos(b.yaw);
      ctx.solids.raycast(b.x, b.y + ctx.tuning.bodies.player.stepHeight, b.z, -fx, 0, -fz, C.trail, Blocks.Move, hit);
      const trail = hit.id >= 0 ? Math.max(0, hit.dist - C.trailGap) : C.trail;
      r.x = b.x - fx * trail;
      r.z = b.z - fz * trail;
      r.y = groundAt(ctx, r.x, r.z, b.y);
    }
  },
};
