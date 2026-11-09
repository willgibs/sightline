import type { Tuning } from '../../config/tuning';
import { dcos, dsin } from '../kernel/core/detmath';
import type { EntityId, EntityIndex } from '../kernel/state';
import type { System, TickContext } from '../kernel/systems';
import { Surface } from '../kernel/world/surfaces';
import type { World } from '../kernel/world/world';
import { clearOfBodies } from '../body';
import { doorSolid, type DoorEntity } from './camp';
import type { PlayerEntity } from './entities';

/**
 * Doors (E7, A9): lab D's doors stand open until someone shuts one. The use key opens or
 * shuts the one in front of the player; a guard who walks up to a shut door opens it, as
 * anyone would. Either way it's a sound, and a door not as it was left is something a
 * guard can notice (perception-spotting).
 *
 * A door's shape never swings into a body (kernel/world/solids.ts): if someone is in the
 * way, it doesn't move.
 */

/** Sets a door, if nobody is in its way: true if it moved. */
function setDoor(ctx: TickContext, e: DoorEntity, open: boolean, by: EntityId): boolean {
  const spec = ctx.world.camp.doors![e.door.index]!;
  const next = doorSolid(spec, open);
  if (!clearOfBodies(next, ctx.state.entities, ctx.tuning.bodies)) return false;
  e.door.open = open;
  // Its shape changes and its id doesn't: the id is how the motor and the renderer find it.
  Object.assign(e.solid, next, { id: e.solid.id });
  const R = ctx.tuning.brain.doors.radius;
  ctx.emit({ type: 'door', source: by, x: spec.x, y: spec.y + 1, z: spec.z, surface: Surface.Wood, loudness: R / ctx.tuning.noise.radiusPerUnit, radius: R, open: open ? 1 : 0 });
  return true;
}

/** The door a press of use would work: the nearest within reach and in front of the player, with free hands. */
export function doorInReach(p: PlayerEntity, index: EntityIndex, world: World, tuning: Tuning): DoorEntity | null {
  const b = p.body;
  if (b.motor !== 'ground' || b.proneTransition || p.control.carrying !== 0) return null;
  const D = tuning.brain.doors;
  const fx = -dsin(b.yaw);
  const fz = -dcos(b.yaw);
  let best: DoorEntity | null = null;
  let bestD = D.reach;
  for (const e of index.of('door')) {
    const spec = world.camp.doors![e.door.index]!;
    const dx = spec.x - b.x;
    const dz = spec.z - b.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d >= bestD || Math.abs(spec.y - b.y) > D.reachHeight) continue;
    if (d > D.underfoot && (fx * dx + fz * dz) / d < D.facingCos) continue;
    best = e;
    bestD = d;
  }
  return best;
}

/** A press of use on a door: open if it was shut, shut if it was open. */
export function workDoor(ctx: TickContext, p: PlayerEntity, door: DoorEntity): void {
  setDoor(ctx, door, !door.door.open, p.id);
}

/** A guard who reaches a shut door opens it: no route needs to know it was shut. */
export const guardDoors: System = {
  name: 'guard-doors',
  phase: 'decide',
  after: ['guard-brains'],
  reads: ['door.door', 'door.solid', 'guard.body', 'player.body'],
  writes: ['door.door.open', 'door.solid'],
  emits: ['door'],
  run(ctx) {
    const doors = ctx.index.of('door');
    if (doors.length === 0) return;
    const D = ctx.tuning.brain.doors;
    for (const e of doors) {
      if (e.door.open) continue;
      const spec = ctx.world.camp.doors![e.door.index]!;
      for (const g of ctx.index.of('guard')) {
        const dx = spec.x - g.body.x;
        const dz = spec.z - g.body.z;
        if (dx * dx + dz * dz > D.guardReach * D.guardReach || Math.abs(spec.y - g.body.y) > D.reachHeight) continue;
        if (setDoor(ctx, e, true, g.id)) break;
      }
    }
  },
};
