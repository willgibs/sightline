import type { Collider } from '../kernel/world/colliders';
import type { System, TickContext } from '../kernel/systems';
import { clearOfBodies } from '../body';
import { Cell, cellIndex } from '../kernel/world/grid';
import { commanderOf, squadArrives } from './comms';
import type { VehicleEntity } from './camp';

/**
 * Vehicles on the move: the target's, driving out along the camp's escape route once he's
 * aboard (E7), when reaching the end loses the mission; and the reinforcements' truck,
 * coming in up the road to stop short of the gate (E8). Each moves as an entity's solid
 * shape does, and swerves or waits rather than drive into anyone (kernel/world/solids.ts).
 * The target is gone from the camp once he's in the cab: bodies don't ride what they stand
 * on yet, and shooting the driver is Phase 3's.
 */

function place(v: VehicleEntity, x: number, z: number, ux: number, uz: number, ctx: TickContext): void {
  const s = v.solid as Collider & { ux: number; uz: number };
  const lift = s.y1 - s.y0;
  const ground = ctx.world.terrain.heightAt(x, z);
  s.x = x;
  s.z = z;
  s.ux = ux;
  s.uz = uz;
  s.y0 = ground;
  s.y1 = ground + lift;
}

/** How far (x, z) is off the line of one leg of the road. */
function offRoad(x: number, z: number, a: Readonly<{ x: number; z: number }>, b: Readonly<{ x: number; z: number }>): number {
  const lx = b.x - a.x;
  const lz = b.z - a.z;
  const len = Math.sqrt(lx * lx + lz * lz);
  return len > 0 ? Math.abs((x - a.x) * lz - (z - a.z) * lx) / len : Math.sqrt((x - a.x) * (x - a.x) + (z - a.z) * (z - a.z));
}

/** Nothing in the way there: no body, and in the camp, ground a body could cross. */
function clear(ctx: TickContext, v: VehicleEntity, x: number, z: number, ux: number, uz: number): boolean {
  const L = ctx.world.grid.site;
  const c = cellIndex(L, x, z);
  // Its own parking place is closed on the site grid, so that's only asked of a swerve (`off` in the caller).
  if (c >= 0 && v.vehicle.driving && offParking(v, x, z, L.cell, ctx) && (L.flags[c]! & Cell.Walkable) === 0) return false;
  return clearOfBodies({ ...v.solid, x, z, ux, uz } as Collider, ctx.state.entities, ctx.tuning.bodies);
}

/** Whether (x, z) is clear of where this vehicle was parked, which the site grid has as closed. */
function offParking(v: VehicleEntity, x: number, z: number, cell: number, ctx: TickContext): boolean {
  const spec = ctx.world.camp.vehicles?.[v.vehicle.index];
  if (!spec) return true;
  const r = Math.sqrt(spec.length * spec.length + spec.width * spec.width) / 2 + ctx.tuning.gen.grid.bodyRadius + cell;
  return (x - spec.x) * (x - spec.x) + (z - spec.z) * (z - spec.z) > r * r;
}

export const vehicleDrive: System = {
  name: 'vehicle-drive',
  phase: 'world',
  after: ['camp-devices'],
  reads: ['vehicle.vehicle', 'vehicle.solid', 'guard.body', 'player.body', 'commander.camp'],
  writes: ['vehicle.vehicle.driving', 'vehicle.solid', 'objective.objective.status', 'commander.camp.objective', 'commander.camp.roster', 'commander.camp.nextTask', 'guard.brain.task', 'entities'],
  emits: ['reinforce'],
  run(ctx) {
    const F = ctx.tuning.brain.alarm.flee;
    for (const v of ctx.index.of('vehicle')) {
      const d = v.vehicle.driving;
      if (!d) continue;
      const target = d.route[d.leg];
      // The road's end is the only way out: an escape held up in the yard hasn't escaped.
      // A truck bringing men in stops short and lets them walk the rest.
      if (!target || (d.then === 'dismount' && d.waited >= F.giveWay)) {
        if (d.then === 'escape') finish(ctx);
        else dismount(ctx, v, d.cause);
        delete v.vehicle.driving;
        continue;
      }
      const dx = target.x - v.solid.x;
      const dz = target.z - v.solid.z;
      const left = Math.sqrt(dx * dx + dz * dz);
      const step = F.drive * ctx.dt;
      if (left <= step) {
        d.leg++;
        continue;
      }
      const ux = dx / left;
      const uz = dz / left;
      // Straight on if it's clear; if someone is in the road, round them, as far off it as it will go.
      const from = d.route[d.leg - 1]!;
      let moved = false;
      for (const side of F.swerveBy) {
        const x = v.solid.x + ux * step - uz * side * step;
        const z = v.solid.z + uz * step + ux * side * step;
        if (side !== 0 && offRoad(x, z, from, target) > F.swerve) continue;
        if (!clear(ctx, v, x, z, ux, uz)) continue;
        place(v, x, z, ux, uz, ctx);
        moved = true;
        break;
      }
      d.waited = moved ? 0 : d.waited + ctx.dt;
    }
  },
};

/** The truck has stopped: the squad gets down behind it (E8). */
function dismount(ctx: TickContext, v: VehicleEntity, cause: number): void {
  const c = commanderOf(ctx);
  if (!c) return;
  const s = v.solid as Collider & { ux: number; uz: number; hx: number };
  const back = s.hx + ctx.tuning.brain.reinforce.truck.dropBehind;
  squadArrives(ctx, c, s.x - s.ux * back, s.z - s.uz * back, s.ux, s.uz, cause);
}

function finish(ctx: TickContext): void {
  const c = commanderOf(ctx);
  if (c?.camp.objective) c.camp.objective.status = 'escaped';
  for (const o of ctx.index.of('objective')) if (o.objective.status === 'escaping') o.objective.status = 'escaped';
}
