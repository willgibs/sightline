import { createBrain, standStill } from '../brain';
import { Surface } from '../kernel/world/surfaces';
import type { Collider } from '../kernel/world/colliders';
import { Faction } from '../kernel/state';
import type { System, TickContext } from '../kernel/systems';
import { clearOfBodies, createBody } from '../body';
import { Cell, cellIndex } from '../kernel/world/grid';
import { createSenses } from '../perception';
import { commanderOf, squadArrives } from './comms';
import type { VehicleEntity } from './camp';
import type { GuardEntity } from './entities';

/**
 * Vehicles on the move: the target's, driving out along the camp's escape route once he's
 * aboard (E7), when reaching the end loses the mission; and the reinforcements' truck,
 * coming in up the road to stop short of the gate (E8). Each moves as an entity's solid
 * shape does, and swerves or waits rather than drive into anyone (kernel/world/solids.ts).
 * The target is gone from the camp once he's in the cab: bodies don't ride what they stand
 * on yet, and shooting the driver is Phase 3's.
 *
 * Waiting has to end. The camp's own men get out of its way: whoever is in front of it is
 * told to step off its line, below his brain, as a shove would move him. Anyone else who
 * holds it up for long enough (you, standing in the road) ends the escape: the target gets
 * out beside it and goes back on foot, the vehicle is left where it stopped, and the camp
 * has no other. A mission can't hang on a vehicle that never arrives and never gives up.
 *
 * An engine running is heard (the 'engine' event): as it starts, and every couple of
 * seconds while it runs, from where the vehicle is. A vehicle on the move is running; so is
 * one a man has started and left standing (startEngine), which is how a camp that means to
 * get its target out says so before he goes (brain/protect.ts). The sounds are made here,
 * ahead of perception in the tick, so the camp's men hear them as they hear anything.
 */

/**
 * Starts a parked vehicle's engine, from the next tick: it runs until the vehicle is driven
 * off, or someone kills it. False if it won't start, which is what sabotage does to it.
 */
export function startEngine(ctx: TickContext, v: VehicleEntity): boolean {
  if (v.vehicle.disabled) return false;
  if (v.vehicle.running === undefined) v.vehicle.running = ctx.tick + 1;
  return true;
}

/** The sound of a vehicle's engine this tick, if it makes one: at the start, and at every `engine.every` after. */
function engineSound(ctx: TickContext, v: VehicleEntity): void {
  const E = ctx.tuning.brain.engine;
  // A dead engine doesn't run, whoever started it.
  if (v.vehicle.disabled) delete v.vehicle.running;
  else if (v.vehicle.driving && v.vehicle.running === undefined) v.vehicle.running = ctx.tick;
  const since = v.vehicle.running;
  if (since === undefined || ctx.tick < since) return;
  const every = Math.max(1, Math.round(E.every * ctx.tuning.sim.tickHz));
  if ((ctx.tick - since) % every !== 0) return;
  const load = ctx.tick === since ? 'start' : v.vehicle.driving ? 'drive' : 'idle';
  const radius = E[load];
  ctx.emit({ type: 'engine', source: v.id, x: v.solid.x, y: (v.solid.y0 + v.solid.y1) / 2, z: v.solid.z, surface: Surface.Metal, loudness: radius / ctx.tuning.noise.radiusPerUnit, radius, load });
}

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
  writes: ['vehicle.vehicle', 'vehicle.solid', 'objective.objective', 'commander.camp.objective', 'commander.camp.roster', 'commander.camp.nextTask', 'commander.camp.relief', 'commander.camp.devices.escape', 'guard.brain.task', 'guard.guard.aside', 'entities'],
  emits: ['reinforce', 'engine'],
  run(ctx) {
    const F = ctx.tuning.brain.alarm.flee;
    for (const v of ctx.index.of('vehicle')) {
      engineSound(ctx, v);
      const d = v.vehicle.driving;
      if (!d) continue;
      const target = d.route[d.leg];
      // The road's end is the only way out: an escape held up in the yard hasn't escaped.
      // A truck bringing men in stops short and lets them walk the rest.
      if (!target || (d.then === 'dismount' && d.waited >= F.giveWay)) {
        if (d.then === 'escape') finish(ctx);
        else dismount(ctx, v, d.cause);
        delete v.vehicle.driving;
        // Where it was going: the engine is switched off.
        delete v.vehicle.running;
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
      if (moved) continue;
      makeWay(ctx, v, ux, uz, step);
      if (d.then === 'escape' && d.waited >= F.bailOut && bailOut(ctx, v, ux, uz)) delete v.vehicle.driving;
    }
  },
};

/** The camp's own men in front of a vehicle step off its line: each to the side he's already on. */
function makeWay(ctx: TickContext, v: VehicleEntity, ux: number, uz: number, step: number): void {
  const ahead = { ...v.solid, x: v.solid.x + ux * step, z: v.solid.z + uz * step, ux, uz } as Collider;
  const until = ctx.tick + Math.round(ctx.tuning.brain.alarm.flee.aside * ctx.tuning.sim.tickHz);
  for (const g of ctx.index.of('guard')) {
    if (clearOfBodies(ahead, [g], ctx.tuning.bodies)) continue;
    const side = (g.body.x - v.solid.x) * -uz + (g.body.z - v.solid.z) * ux >= 0 ? 1 : -1;
    g.guard.aside = { x: -uz * side, z: ux * side, until };
  }
}

/**
 * The man in the cab gets out, because the vehicle isn't going anywhere: beside it, on the
 * nearest ground a man can stand on that nobody is standing on, as the guard he was, knowing
 * what he knew about the alarm. The vehicle stays where it stopped and the camp counts it
 * lost. False if there's nowhere to stand yet, and it waits on.
 */
function bailOut(ctx: TickContext, v: VehicleEntity, ux: number, uz: number): boolean {
  const c = commanderOf(ctx);
  const rider = v.vehicle.rider;
  if (!c?.camp.objective || !rider) return false;
  const s = v.solid as Collider & { hz: number };
  const spec = ctx.tuning.bodies.guard;
  const reach = s.hz + ctx.tuning.brain.alarm.flee.boardGap + spec.radius;
  const L = ctx.world.grid.site;
  // Out from each door in turn, a cell at a time: where it was parked is closed ground on the camp's grid.
  for (let out = 0; out < BAIL_REACH; out++) {
    for (const side of [1, -1]) {
      const x = v.solid.x - uz * side * (reach + out * L.cell);
      const z = v.solid.z + ux * side * (reach + out * L.cell);
      const cell = cellIndex(L, x, z);
      if (cell >= 0 && (L.flags[cell]! & Cell.Walkable) === 0) continue;
      if (!standingRoom(ctx, x, z, spec.radius)) continue;
      const body = createBody(ctx.world, ctx.solids, spec, x, z, -uz * side, ux * side);
      const brain = createBrain();
      brain.sirenAt = ctx.tick;
      const g = ctx.spawn((id): GuardEntity => ({ id, kind: 'guard', faction: Faction.Camp, body, guard: { spawn: rider.spawn, headYaw: 0, order: standStill() }, senses: createSenses(false), brain }));
      c.camp.roster.push({ id: g.id, post: rider.spawn, x, z, tick: ctx.tick, status: 'ok' });
      c.camp.objective.target = g.id;
      c.camp.objective.status = 'open';
      for (const o of ctx.index.of('objective')) {
        if (o.objective.status !== 'escaping') continue;
        o.objective.status = 'open';
        o.objective.target = g.id;
      }
      // There's no second vehicle, and nobody runs for this one again.
      c.camp.devices.escape = null;
      v.vehicle.disabled = true;
      delete v.vehicle.rider;
      return true;
    }
  }
  return false;
}

/** How many cells out from a door a place to stand is looked for. */
const BAIL_REACH = 6;

/** Nobody is standing within a body's width of (x, z). */
function standingRoom(ctx: TickContext, x: number, z: number, radius: number): boolean {
  for (const e of ctx.state.entities) {
    if (e.kind !== 'guard' && e.kind !== 'player') continue;
    const dx = e.body.x - x;
    const dz = e.body.z - z;
    const gap = radius + ctx.tuning.bodies[e.kind].radius;
    if (dx * dx + dz * dz < gap * gap) return false;
  }
  return true;
}

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
