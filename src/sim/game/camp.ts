import type { DoorSpec, VehicleSpec } from '../generation';
import type { Simulation as KernelSimulation } from '../kernel/sim';
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
 * those labs add state to them rather than inventing their own. Phase 0's test camp has
 * neither, so its runs spawn nothing here.
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
 * A door's leaf: across its doorway when shut, swung into the room about its hinge when
 * open, where it stops bodies and sight like any slab but leaves the doorway clear.
 */
export function doorSolid(d: DoorSpec, open: boolean): Collider {
  const leaf = 0.05;
  if (!open) {
    return { id: 0, kind: 'box', x: d.x, z: d.z, y0: d.y, y1: d.y + d.height, hx: d.width / 2, hz: 0.06, ux: d.ux, uz: d.uz, flags: Blocks.All, surface: Surface.Wood };
  }
  // Hinged at the doorway's first edge, standing open along the inside of the wall's normal.
  const hx = d.x - d.ux * (d.width / 2) + d.nx * (d.width / 2 + 0.12) + d.ux * leaf;
  const hz = d.z - d.uz * (d.width / 2) + d.nz * (d.width / 2 + 0.12) + d.uz * leaf;
  return { id: 0, kind: 'box', x: hx, z: hz, y0: d.y, y1: d.y + d.height, hx: d.width / 2, hz: leaf, ux: d.nx, uz: d.nz, flags: Blocks.All, surface: Surface.Wood };
}

export function vehicleSolid(v: VehicleSpec): Collider {
  return { id: 0, kind: 'box', x: v.x, z: v.z, y0: v.y - 0.2, y1: v.y + v.height, hx: v.length / 2, hz: v.width / 2, ux: v.fx, uz: v.fz, flags: Blocks.All, surface: Surface.Metal };
}
