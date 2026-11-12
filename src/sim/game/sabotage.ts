import { dcos, dsin } from '../kernel/core/detmath';
import type { EntityIndex } from '../kernel/state';
import type { TickContext } from '../kernel/systems';
import type { Tuning } from '../../config/tuning';
import { Blocks, type BoxCollider, type RayHit } from '../kernel/world/colliders';
import type { Solids } from '../kernel/world/solids';
import type { World } from '../kernel/world/world';
import type { GeneratorEntity, RadioEntity, VehicleEntity } from './camp';
import type { PlayerEntity } from './entities';

/**
 * Sabotage (E7): hold the use key at arm's length to stop the generator, break the radio
 * (at its set, or at its mast), or disable the target's vehicle. The core's sabotage: it
 * takes a few seconds and nothing but your hands. The kit is Phase 3's.
 *
 * What it does is lab D's to say (game/camp.ts): a stopped generator takes its circuit
 * down with it, and a broken radio is broken. Nobody is told; the camp finds out when
 * someone passes it or needs it (perception-spotting, and game/comms.ts).
 *
 * A rifle does it too, to what a round can break (`struckEquipment`; the owner, Nov 12:
 * "there's no way to disable any of the sirens or generators without actually physically
 * reaching them"). A round through an alarm box kills that box, and the camp has others:
 * a man who throws a dead one goes for the next. The camp finds out as it finds out about
 * a hand's work, and hears the round strike metal as it hears any strike. What a round
 * breaks, and how many it takes, is data (`ballistics.breaks`): the generator is in the
 * table, at none, until a camp has an answer to losing its power from a ridge.
 */

export type SabotageKind = 'generator' | 'radio' | 'vehicle';

/**
 * A round has struck a collider: if it's the camp's generator, running, or one of its alarm
 * boxes, whole, and it has now taken as many rounds as it takes, that is put out of action.
 * Returns what, with where it stands, or null if the round broke nothing.
 */
export function struckEquipment(ctx: TickContext, collider: number): { what: 'generator' | 'alarm'; x: number; z: number } | null {
  const camp = ctx.world.camp;
  const devices = camp.devices ?? [];
  const B = ctx.tuning.ballistics.breaks;
  const hit = (device: number): { x: number; z: number } | null => {
    const d = devices[device];
    return d && camp.structures[d.structure]?.colliders.includes(collider) ? d : null;
  };
  if (B.generator > 0) {
    for (const e of ctx.index.of('generator')) {
      const d = e.generator.running ? hit(e.generator.device) : null;
      if (!d) continue;
      e.generator.hits = (e.generator.hits ?? 0) + 1;
      if (e.generator.hits < B.generator) return null;
      e.generator.running = false;
      return { what: 'generator', x: d.x, z: d.z };
    }
  }
  if (B.alarm > 0) {
    for (const e of ctx.index.of('alarm')) {
      const d = e.alarm.broken ? null : hit(e.alarm.device);
      if (!d) continue;
      e.alarm.hits = (e.alarm.hits ?? 0) + 1;
      if (e.alarm.hits < B.alarm) return null;
      e.alarm.broken = true;
      e.alarm.powered = false;
      return { what: 'alarm', x: d.x, z: d.z };
    }
  }
  return null;
}

/** Something that can be sabotaged, and where a hand reaches it. */
interface Spot {
  entity: GeneratorEntity | RadioEntity | VehicleEntity;
  kind: SabotageKind;
  x: number;
  y: number;
  z: number;
  /** The colliders of the thing itself: a line to it may end on them. */
  own: readonly number[];
}

/** Everything that can be sabotaged, as seen by someone standing at (x, z). */
function spots(index: EntityIndex, world: World, x: number, z: number): Spot[] {
  const camp = world.camp;
  const out: Spot[] = [];
  const colliders = (structure: number): readonly number[] => camp.structures[structure]?.colliders ?? [];
  for (const e of index.of('generator')) {
    const d = camp.devices?.[e.generator.device];
    if (d && e.generator.running) out.push({ entity: e, kind: 'generator', x: d.x, y: d.y, z: d.z, own: colliders(d.structure) });
  }
  for (const e of index.of('radio')) {
    const d = camp.devices?.[e.radio.device];
    if (!d || !e.radio.working) continue;
    out.push({ entity: e, kind: 'radio', x: d.x, y: d.y, z: d.z, own: colliders(d.structure) });
    // Or at the foot of its mast, wherever the radio room hides that.
    camp.structures.forEach((s, k) => {
      if (s.kind !== 'mast') return;
      const c = world.colliders.list[s.colliders[0]!]!;
      out.push({ entity: e, kind: 'radio', x: c.x, y: world.terrain.heightAt(c.x, c.z) + 1, z: c.z, own: colliders(k) });
    });
  }
  for (const e of index.of('vehicle')) {
    const v = camp.vehicles?.[e.vehicle.index];
    if (!v || !e.vehicle.escape || e.vehicle.disabled || e.vehicle.driving) continue;
    // A hand meets a vehicle at the nearest point of its side, whichever side that is.
    const at = nearestOn(e.solid as BoxCollider, x, z);
    out.push({ entity: e, kind: 'vehicle', x: at.x, y: e.solid.y0 + 1, z: at.z, own: [e.solid.id] });
  }
  return out;
}

/** The point of a box's footprint nearest (x, z). */
function nearestOn(c: BoxCollider, x: number, z: number): { x: number; z: number } {
  const lx = (x - c.x) * c.ux + (z - c.z) * c.uz;
  const lz = (z - c.z) * c.ux - (x - c.x) * c.uz;
  const ax = Math.max(-c.hx, Math.min(c.hx, lx));
  const az = Math.max(-c.hz, Math.min(c.hz, lz));
  return { x: c.x + ax * c.ux - az * c.uz, z: c.z + ax * c.uz + az * c.ux };
}

const hit: RayHit = { dist: Infinity, id: -1 };

/** The nearest thing a hand can reach from where the player stands and faces, if the hands are free. */
function inReach(p: PlayerEntity, index: EntityIndex, world: World, solids: Solids, tuning: Tuning): Spot | null {
  const b = p.body;
  if (b.motor !== 'ground' || b.stance === 'prone' || b.proneTransition || p.control.carrying !== 0) return null;
  const S = tuning.brain.sabotage;
  const fx = -dsin(b.yaw);
  const fz = -dcos(b.yaw);
  const eye = b.y + b.eyeHeight;
  let best: Spot | null = null;
  let bestD = Infinity;
  for (const s of spots(index, world, b.x, b.z)) {
    if (Math.abs(s.y - b.y - 1) > S.reachHeight) continue;
    const dx = s.x - b.x;
    const dz = s.z - b.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > S.reach || d >= bestD) continue;
    if (d > S.underfoot && (fx * dx + fz * dz) / d < S.facingCos) continue;
    // Nothing between the eye and it but the thing itself.
    const dy = s.y - eye;
    const line = Math.sqrt(d * d + dy * dy);
    solids.raycast(b.x, eye, b.z, dx / line, dy / line, dz / line, line, Blocks.Move, hit);
    if (hit.id >= 0 && !s.own.includes(hit.id)) continue;
    best = s;
    bestD = d;
  }
  return best;
}

/** What holding use would do now, if anything: for the prompt. */
export function sabotagePrompt(p: PlayerEntity, index: EntityIndex, world: World, solids: Solids, tuning: Tuning): '' | SabotageKind {
  return inReach(p, index, world, solids, tuning)?.kind ?? '';
}

/** How far along the player's work is, 0 to 1, for the prompt. */
export function sabotageProgress(p: PlayerEntity, index: EntityIndex, tuning: Tuning): number {
  const w = p.control.working;
  if (!w) return 0;
  const e = index.get(w.target);
  if (!e || (e.kind !== 'generator' && e.kind !== 'radio' && e.kind !== 'vehicle')) return 0;
  return Math.min(1, w.held / tuning.brain.sabotage.seconds[e.kind]);
}

/**
 * Use held at arm's length, once a tick from the use system: the time adds up while the
 * same thing stays in reach, and it's done when it's done. Let go, or step away, and it
 * starts again.
 */
export function workAtArmsLength(ctx: TickContext, p: PlayerEntity): void {
  const c = p.control;
  const spot = ctx.input.use ? inReach(p, ctx.index, ctx.world, ctx.solids, ctx.tuning) : null;
  if (!spot) {
    delete c.working;
    return;
  }
  if (c.working?.target !== spot.entity.id) c.working = { target: spot.entity.id, held: 0 };
  c.working.held += ctx.dt;
  if (c.working.held < ctx.tuning.brain.sabotage.seconds[spot.kind]) return;
  delete c.working;
  done(spot);
  ctx.emit({ type: 'sabotage', source: p.id, what: spot.kind, x: spot.x, z: spot.z });
}

function done(s: Spot): void {
  if (s.entity.kind === 'generator') s.entity.generator.running = false;
  else if (s.entity.kind === 'radio') s.entity.radio.working = false;
  else s.entity.vehicle.disabled = true;
}

