import { overlapsBody, type Collider } from '../kernel/world/colliders';
import type { System, TickContext } from '../kernel/systems';
import { bodyHeight, hasBody } from '../body';
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

function clear(ctx: TickContext, v: VehicleEntity, x: number, z: number, ux: number, uz: number): boolean {
  const next: Collider = { ...v.solid, x, z, ux, uz } as Collider;
  for (const b of ctx.state.entities) {
    if (!hasBody(b)) continue;
    const spec = ctx.tuning.bodies[b.kind];
    if (overlapsBody(next, b.body.x, b.body.y, b.body.z, spec.radius + 0.02, bodyHeight(b.body, spec))) return false;
  }
  return true;
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
      if (!target || d.waited >= F.giveWay) {
        // At the end of the road, or, held up too long, through whoever is in the way.
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
      // Straight on if it's clear; if someone is in the road, round them.
      let moved = false;
      for (const side of SWERVE) {
        const x = v.solid.x + ux * step - uz * side * step;
        const z = v.solid.z + uz * step + ux * side * step;
        if (side !== 0 && Math.abs(side * step) > F.swerve) continue;
        if (!clear(ctx, v, x, z, ux, uz)) continue;
        place(v, x, z, ux, uz, ctx);
        moved = true;
        break;
      }
      d.waited = moved ? 0 : d.waited + ctx.dt;
    }
  },
};

/** Sideways per metre forward, in the order they're tried: straight, then a little to each side, then more. */
const SWERVE = [0, 0.5, -0.5, 1, -1, 2, -2];

/** The truck has stopped: the squad gets down behind it (E8). */
function dismount(ctx: TickContext, v: VehicleEntity, cause: number): void {
  const c = commanderOf(ctx);
  if (!c) return;
  const s = v.solid as Collider & { ux: number; uz: number; hx: number };
  const back = s.hx + 1.5;
  squadArrives(ctx, c, s.x - s.ux * back, s.z - s.uz * back, s.ux, s.uz, cause);
}

function finish(ctx: TickContext): void {
  const c = commanderOf(ctx);
  if (c?.camp.objective) c.camp.objective.status = 'escaped';
  for (const o of ctx.index.of('objective')) if (o.objective.status === 'escaping') o.objective.status = 'escaped';
}
