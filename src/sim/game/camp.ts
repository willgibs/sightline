import type { Tuning } from '../../config/tuning';
import type { DoorSpec, VehicleSpec } from '../generation';
import type { Simulation as KernelSimulation } from '../kernel/sim';
import type { System, TickContext } from '../kernel/systems';
import { Faction, type EntityBase } from '../kernel/state';
import { clearOfBodies } from '../body';
import { Blocks, type Collider } from '../kernel/world/colliders';
import { Cell, cellAt, cellIndex } from '../kernel/world/grid';
import { GridSearch } from '../kernel/world/search';
import type { WorkCounts } from '../kernel/work';
import { Surface } from '../kernel/world/surfaces';
import type { World } from '../kernel/world/world';

/**
 * The camp's things with state (lab D, D4): its doors and its vehicles, spawned from the
 * generated camp after the guards, so the player stays entity 1 and the guards keep their
 * ids. Each has a solid shape (kernel/world/solids.ts) that the motor and every query see
 * as they see a wall: a shut door stops bodies, sight, bullets and sound, and a parked
 * truck is cover.
 *
 * Nothing changes them yet. Lab E's guards open and shut doors and drive the escape
 * vehicle at lockdown; lab C's use action opens doors. They are kinds of their own, so
 * those labs add state to them rather than inventing their own. A handmade scene's camp
 * may have neither, and then spawns nothing here.
 */
export interface DoorEntity extends EntityBase {
  kind: 'door';
  door: {
    /** Which of the camp's doors (world.camp.doors). */
    index: number;
    open: boolean;
  };
  solid: Collider;
}

export interface VehicleEntity extends EntityBase {
  kind: 'vehicle';
  vehicle: {
    /** Which of the camp's vehicles (world.camp.vehicles). */
    index: number;
    /** The target's way out at lockdown (lab E). */
    escape: boolean;
    /** Sabotaged (E7): it won't start. Absent until someone does it. */
    disabled?: boolean;
    /** Who is in the cab on the way out (E7): the post he came from, so that he can get out again if it's held up (game/escape.ts). */
    rider?: { spawn: number };
    /** On the move (E7, E8): the way it's going, which leg it's on, how long it has been held up, what happens at the end, and why it's going. Absent while parked. */
    driving?: { route: Array<{ x: number; z: number }>; leg: number; waited: number; then: 'escape' | 'dismount'; cause: number };
  };
  solid: Collider;
}

declare module '../kernel/state' {
  interface EntityKinds {
    door: DoorEntity;
    vehicle: VehicleEntity;
  }
}

/**
 * Where someone gets into a vehicle (E7): beside it, on whichever side is nearer the
 * camp's centre and clear to stand on. Lab D's vehicles park beside walls, so the nearer
 * side may be taken.
 */
export function boardingPoint(world: World, v: VehicleSpec, tuning: Tuning): { x: number; z: number } {
  const reach = v.width / 2 + tuning.brain.alarm.flee.boardGap;
  const site = world.camp.site;
  const sides = [1, -1]
    .map((s) => ({ x: v.x - v.fz * s * reach, z: v.z + v.fx * s * reach }))
    .sort((a, b) => (a.x - site.x) * (a.x - site.x) + (a.z - site.z) * (a.z - site.z) - ((b.x - site.x) * (b.x - site.x) + (b.z - site.z) * (b.z - site.z)) || a.x - b.x || a.z - b.z);
  for (const p of sides) {
    const c = cellAt(world.grid, p.x, p.z);
    if (c && (c.layer.flags[c.index]! & Cell.Walkable) !== 0) return p;
  }
  return sides[0]!;
}

/** The way the target's vehicle leaves (E7): from the gate on, down the road itself, as far as `driveOut` takes it. */
export function escapeRoute(world: World, tuning: Tuning): Array<{ x: number; z: number }> {
  const escape = world.camp.layout?.skeleton.escape;
  if (!escape) return [];
  const gate = escape[3]!;
  const route = [{ x: gate.x, z: gate.z }];
  const road = world.features.road.points;
  let first = 0;
  let nearest = Infinity;
  road.forEach((p, k) => {
    const d = (p.x - gate.x) * (p.x - gate.x) + (p.z - gate.z) * (p.z - gate.z);
    if (d < nearest) {
      nearest = d;
      first = k;
    }
  });
  let gone = 0;
  for (let k = first + 1; k < road.length && gone < tuning.brain.alarm.flee.driveOut; k++) {
    const p = road[k]!;
    const last = route[route.length - 1]!;
    gone += Math.sqrt((p.x - last.x) * (p.x - last.x) + (p.z - last.z) * (p.z - last.z));
    route.push({ x: p.x, z: p.z });
  }
  // A camp whose road ends at its gate still has the old way out.
  return route.length > 1 ? route : escape.slice(3).map((p) => ({ x: p.x, z: p.z }));
}

/**
 * The way a vehicle gets across the yard from where it's parked to the gate: round the
 * buildings on the site grid, with room for its width. Cells near anything a body can't
 * cross are closed, its own parking place excepted. The waypoints are pulled straight
 * where the yard allows. Null if it's boxed in, or the search runs out (rule 18).
 */
export function yardRoute(world: World, tuning: Tuning, v: VehicleSpec, work?: WorkCounts): Array<{ x: number; z: number }> | null {
  // It depends on the camp as it was built, where the vehicle is parked and a few numbers, and
  // on nothing in a run: found once and kept (a scene's setup asks first, so no tick pays for it).
  let kept = yards.get(world);
  if (!kept) yards.set(world, (kept = new Map()));
  const F = tuning.brain.alarm.flee;
  const key = [v.x, v.z, v.length, v.width, F.clearance, F.routeReach, F.routeExpansions, tuning.gen.grid.bodyRadius].join(' ');
  let route = kept.get(key);
  if (route === undefined) kept.set(key, (route = findYardRoute(world, tuning, v, work)));
  // A copy: whoever asks may keep it and add the road to it.
  return route ? route.map((p) => ({ x: p.x, z: p.z })) : null;
}

const yards = new WeakMap<World, Map<string, Array<{ x: number; z: number }> | null>>();

function findYardRoute(world: World, tuning: Tuning, v: VehicleSpec, work?: WorkCounts): Array<{ x: number; z: number }> | null {
  const gate = world.camp.layout?.skeleton.escape[3];
  if (!gate) return null;
  const L = world.grid.site;
  const F = tuning.brain.alarm.flee;
  const parked = Math.sqrt(v.length * v.length + v.width * v.width) / 2 + tuning.gen.grid.bodyRadius + L.cell;
  const shut = new Uint8Array(L.nx * L.nz);
  for (let j = 0; j < L.nz; j++) {
    for (let i = 0; i < L.nx; i++) {
      const c = j * L.nx + i;
      if ((L.flags[c]! & Cell.Walkable) !== 0) continue;
      const dx = L.x0 + (i + 0.5) * L.cell - v.x;
      const dz = L.z0 + (j + 0.5) * L.cell - v.z;
      if (dx * dx + dz * dz > parked * parked) shut[c] = 1;
    }
  }
  // Walkable already keeps a body's radius from anything solid; the rest of its half-width is the vehicle's.
  const k = Math.ceil(Math.max(0, v.width / 2 + F.clearance - tuning.gen.grid.bodyRadius) / L.cell);
  const closed = widen(shut, L.nx, L.nz, k);
  const open = (c: number): boolean => closed[c] === 0 && (L.flags[c]! & Cell.Walkable) !== 0;
  const nearest = (x: number, z: number): number => {
    const ci = Math.floor((x - L.x0) / L.cell);
    const cj = Math.floor((z - L.z0) / L.cell);
    const reach = Math.ceil(F.routeReach / L.cell);
    let best = -1;
    let bestD = Infinity;
    for (let j = Math.max(0, cj - reach); j <= Math.min(L.nz - 1, cj + reach); j++) {
      for (let i = Math.max(0, ci - reach); i <= Math.min(L.nx - 1, ci + reach); i++) {
        const c = j * L.nx + i;
        if (!open(c)) continue;
        const dx = L.x0 + (i + 0.5) * L.cell - x;
        const dz = L.z0 + (j + 0.5) * L.cell - z;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
    }
    return best;
  };
  const start = nearest(v.x, v.z);
  const goal = nearest(gate.x, gate.z);
  if (start < 0 || goal < 0) return null;
  const cells: number[] = [];
  const found = new GridSearch(L).path(start, goal, { cost: (_, to, length) => (open(to) ? length : -1), maxExpansions: F.routeExpansions, ...(work ? { work } : {}) }, cells);
  if (!found.found) return null;
  const at = (c: number) => ({ x: L.x0 + ((c % L.nx) + 0.5) * L.cell, z: L.z0 + (Math.floor(c / L.nx) + 0.5) * L.cell });
  const clearLine = (a: number, b: number): boolean => {
    const p = at(a);
    const q = at(b);
    const steps = Math.ceil(Math.sqrt((q.x - p.x) * (q.x - p.x) + (q.z - p.z) * (q.z - p.z)) / (L.cell / 2));
    for (let s = 0; s <= steps; s++) {
      const c = cellIndex(L, p.x + ((q.x - p.x) * s) / steps, p.z + ((q.z - p.z) * s) / steps);
      if (c < 0 || !open(c)) return false;
    }
    return true;
  };
  const out = [at(start)];
  for (let n = 0; n < cells.length - 1; ) {
    let far = cells.length - 1;
    while (far > n + 1 && !clearLine(cells[n]!, cells[far]!)) far--;
    out.push(at(cells[far]!));
    n = far;
  }
  return out;
}

/** The cells within `k` of a marked cell, by columns and then rows. */
function widen(marked: Uint8Array, nx: number, nz: number, k: number): Uint8Array {
  const pass = (src: Uint8Array, along: (a: number, b: number) => number, na: number, nb: number): Uint8Array => {
    const out = new Uint8Array(src.length);
    for (let b = 0; b < nb; b++) {
      let last = -Infinity;
      for (let a = 0; a < na; a++) {
        if (src[along(a, b)]) last = a;
        if (a - last <= k) out[along(a, b)] = 1;
      }
      last = Infinity;
      for (let a = na - 1; a >= 0; a--) {
        if (src[along(a, b)]) last = a;
        if (last - a <= k) out[along(a, b)] = 1;
      }
    }
    return out;
  };
  return pass(pass(marked, (a, b) => b * nx + a, nx, nz), (a, b) => a * nx + b, nz, nx);
}

/** The way a reinforcement truck comes in (E8): up the road from the edge of the map, stopping short of the gate. Null for a camp with no road laid out. */
export function truckRoute(world: World, tuning: Tuning): Array<{ x: number; z: number }> | null {
  const escape = world.camp.layout?.skeleton.escape;
  if (!escape) return null;
  const R = tuning.brain.reinforce;
  const gate = escape[3]!;
  const edge = world.playHalf - R.edgeMargin;
  const inside = world.features.road.points.filter((p) => Math.max(Math.abs(p.x), Math.abs(p.z)) < edge);
  const route: Array<{ x: number; z: number }> = [];
  for (let k = inside.length - 1; k >= 0; k--) {
    const p = inside[k]!;
    const away = Math.sqrt((p.x - gate.x) * (p.x - gate.x) + (p.z - gate.z) * (p.z - gate.z));
    if (away <= R.truck.stopShort) break;
    const last = route[route.length - 1];
    if (!last || Math.sqrt((p.x - last.x) * (p.x - last.x) + (p.z - last.z) * (p.z - last.z)) >= R.truck.every) route.push({ x: p.x, z: p.z });
  }
  return route.length >= 2 ? route : null;
}

/** How long a truck takes over a route, in seconds. */
export function routeSeconds(route: ReadonlyArray<{ x: number; z: number }>, tuning: Tuning): number {
  let metres = 0;
  for (let k = 1; k < route.length; k++) metres += Math.sqrt((route[k]!.x - route[k - 1]!.x) * (route[k]!.x - route[k - 1]!.x) + (route[k]!.z - route[k - 1]!.z) * (route[k]!.z - route[k - 1]!.z));
  return metres / tuning.brain.alarm.flee.drive;
}

/** A truck on the road, coming in: at the first point of its route, heading for the second (E8). False if someone is standing where it would appear. */
export function spawnTruck(ctx: TickContext, route: Array<{ x: number; z: number }>, cause: number): boolean {
  const R = ctx.tuning.brain.reinforce.truck;
  const a = route[0]!;
  const b = route[1]!;
  const d = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z)) || 1;
  const spec: VehicleSpec = { kind: 'truck', x: a.x, y: ctx.world.terrain.heightAt(a.x, a.z), z: a.z, fx: (b.x - a.x) / d, fz: (b.z - a.z) / d, length: R.length, width: R.width, height: R.height, escape: false };
  const solid = vehicleSolid(spec);
  if (!clearOfBodies(solid, ctx.state.entities, ctx.tuning.bodies)) return false;
  ctx.spawn((id): VehicleEntity => ({ id, kind: 'vehicle', faction: Faction.None, vehicle: { index: -1, escape: false, driving: { route, leg: 1, waited: 0, then: 'dismount', cause } }, solid }));
  return true;
}

/** The camp's doors and vehicles, as entities, in the camp's order: doors first. */
export function spawnCampThings(sim: KernelSimulation): void {
  const { camp } = sim.world;
  (camp.doors ?? []).forEach((spec, index) => {
    sim.spawn((id): DoorEntity => ({ id, kind: 'door', faction: Faction.None, door: { index, open: spec.open }, solid: doorSolid(spec, spec.open) }));
  });
  (camp.vehicles ?? []).forEach((spec, index) => {
    sim.spawn((id): VehicleEntity => ({ id, kind: 'vehicle', faction: Faction.None, vehicle: { index, escape: spec.escape }, solid: vehicleSolid(spec) }));
  });
}

/**
 * A door's leaf: across its doorway when shut; swung all the way open when open, flat
 * against the inside of the wall beside the doorway, where it is in no one's way (the
 * spatial grid, built from the world's colliders alone, doesn't know it is there).
 */
export function doorSolid(d: DoorSpec, open: boolean): Collider {
  const leaf = 0.03;
  if (!open) {
    return { id: 0, kind: 'box', x: d.x, z: d.z, y0: d.y, y1: d.y + d.height, hx: d.width / 2, hz: 0.06, ux: d.ux, uz: d.uz, flags: Blocks.All, surface: Surface.Wood };
  }
  // Hinged at the doorway's first edge: open, it lies along the wall past that edge, just inside.
  const inside = 0.1 + leaf + 0.02;
  const x = d.x - d.ux * d.width + d.nx * inside;
  const z = d.z - d.uz * d.width + d.nz * inside;
  return { id: 0, kind: 'box', x, z, y0: d.y, y1: d.y + d.height, hx: d.width / 2, hz: leaf, ux: d.ux, uz: d.uz, flags: Blocks.All, surface: Surface.Wood };
}

export function vehicleSolid(v: VehicleSpec): Collider {
  return { id: 0, kind: 'box', x: v.x, z: v.z, y0: v.y - 0.2, y1: v.y + v.height, hx: v.length / 2, hz: v.width / 2, ux: v.fx, uz: v.fz, flags: Blocks.All, surface: Surface.Metal };
}

/**
 * The camp's systems with state (D5): the generator, and the lights, alarm boxes and radio
 * it powers, each an entity whose `device` is its index in world.camp.devices, and the
 * mission's objective. Lab E's guards raise alarms and call on the radio; lab C's use
 * action, and lab E's sabotage, stop the generator or break the radio. What they change
 * is here, so every lab reads one answer: is that alarm box live?
 */
export interface GeneratorEntity extends EntityBase {
  kind: 'generator';
  generator: { device: number; running: boolean };
}

export interface LightEntity extends EntityBase {
  kind: 'light';
  light: { device: number; on: boolean };
}

export interface AlarmEntity extends EntityBase {
  kind: 'alarm';
  /** Powered by its generator; raised by a guard who reaches it (lab E), which sets lockdown. */
  alarm: { device: number; powered: boolean; raised: boolean };
}

export interface RadioEntity extends EntityBase {
  kind: 'radio';
  /** Powered by its generator; working until sabotaged (its set or its antenna). Lab E's check-ins need both. */
  radio: { device: number; powered: boolean; working: boolean };
}

export type ObjectiveStatus = 'open' | 'done' | 'escaping' | 'escaped';

export interface ObjectiveEntity extends EntityBase {
  kind: 'objective';
  objective: {
    kind: 'eliminate';
    /** The target's entity. */
    target: number;
    /** Open until the target is dead (done), in his vehicle on the way out (escaping), or gone (escaped, lab E). */
    status: ObjectiveStatus;
  };
}

declare module '../kernel/state' {
  interface EntityKinds {
    generator: GeneratorEntity;
    light: LightEntity;
    alarm: AlarmEntity;
    radio: RadioEntity;
    objective: ObjectiveEntity;
  }
}

/** The camp's devices, then its objective, after its doors and vehicles. */
export function spawnCampSystems(sim: KernelSimulation): void {
  const { camp } = sim.world;
  (camp.devices ?? []).forEach((d, device) => {
    if (d.kind === 'generator') sim.spawn((id): GeneratorEntity => ({ id, kind: 'generator', faction: Faction.Camp, generator: { device, running: true } }));
    else if (d.kind === 'light') sim.spawn((id): LightEntity => ({ id, kind: 'light', faction: Faction.Camp, light: { device, on: true } }));
    else if (d.kind === 'alarm') sim.spawn((id): AlarmEntity => ({ id, kind: 'alarm', faction: Faction.Camp, alarm: { device, powered: true, raised: false } }));
    else sim.spawn((id): RadioEntity => ({ id, kind: 'radio', faction: Faction.Camp, radio: { device, powered: true, working: true } }));
  });
  const o = camp.objective;
  if (o) {
    const target = sim.index.of('guard').find((g) => g.guard.spawn === o.target);
    if (!target) throw new Error(`The objective's target (post ${o.target}) has no guard`);
    sim.spawn((id): ObjectiveEntity => ({ id, kind: 'objective', faction: Faction.None, objective: { kind: o.kind, target: target.id, status: 'open' } }));
  }
}

/** Whether each device's generator runs, by device index: what the camp's power system reads. */
function poweredBy(generators: readonly GeneratorEntity[], device: number, devices: readonly { feed: number }[]): boolean {
  const feed = devices[device]!.feed;
  for (const g of generators) if (g.generator.device === feed) return g.generator.running;
  return false;
}

/**
 * The camp's power (D5): everything on a generator's circuit is powered while it runs. A
 * light is on while powered; an alarm box can be raised only while powered; the radio
 * works only while powered and unbroken. Runs in the 'world' phase, after bodies move and
 * before guards perceive, so a cut is seen in the tick it happens.
 */
export const campPower: System = {
  name: 'camp-power',
  phase: 'world',
  reads: ['generator.generator'],
  writes: ['light.light.on', 'alarm.alarm.powered', 'radio.radio.powered'],
  emits: [],
  run(ctx) {
    const generators = ctx.index.of('generator');
    if (generators.length === 0) return;
    const devices = ctx.world.camp.devices ?? [];
    for (const l of ctx.index.of('light')) l.light.on = poweredBy(generators, l.light.device, devices);
    for (const a of ctx.index.of('alarm')) a.alarm.powered = poweredBy(generators, a.alarm.device, devices);
    for (const r of ctx.index.of('radio')) r.radio.powered = poweredBy(generators, r.radio.device, devices);
  },
};

/** The objective (D5): done once its target is gone from the camp, killed (lab B). */
export const objectiveStatus: System = {
  name: 'objective',
  phase: 'mission',
  reads: ['guard'],
  writes: ['objective.objective.status'],
  emits: [],
  run(ctx) {
    for (const o of ctx.index.of('objective')) {
      if (o.objective.status === 'open' && !ctx.index.get(o.objective.target)) o.objective.status = 'done';
    }
  },
};
