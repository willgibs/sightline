import type { DoorSpec, VehicleSpec } from '../generation';
import type { Simulation as KernelSimulation } from '../kernel/sim';
import type { System } from '../kernel/systems';
import { Faction, type EntityBase } from '../kernel/state';
import { Blocks, type Collider } from '../kernel/world/colliders';
import { Surface } from '../kernel/world/surfaces';

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
  };
  solid: Collider;
}

declare module '../kernel/state' {
  interface EntityKinds {
    door: DoorEntity;
    vehicle: VehicleEntity;
  }
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

export type ObjectiveStatus = 'open' | 'done' | 'escaped';

export interface ObjectiveEntity extends EntityBase {
  kind: 'objective';
  objective: {
    kind: 'eliminate';
    /** The target's entity. */
    target: number;
    /** Open until the target is dead (done) or gone in his vehicle (escaped, lab E). */
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
