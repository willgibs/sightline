import type { Tuning } from '../../config/tuning';
import { queryBodies, stridePhase, type BodyState, type Gait, type Stance } from '../body';
import { generateWorld, worldFingerprint } from '../generation';
import type { Game } from '../kernel/game';
import { neutralInput } from '../kernel/input';
import { missionSpec, type SpawnKind } from '../kernel/mission';
import { Simulation as KernelSimulation } from '../kernel/sim';
import type { EntityId, SimState } from '../kernel/state';
import type { System } from '../kernel/systems';
import type { Collider } from '../kernel/world/colliders';
import type { World } from '../kernel/world/world';
import { PLAYER_ID, player, type GuardEntity, type PlayerEntity } from './entities';
import type { PlayerControl } from './player';
import { writeSample } from './samples';
import { startRun } from './setup';
import { BEHAVIOUR } from './golden';
import { SYSTEMS } from './systems';

/**
 * Sightline, as the kernel runs it (kernel/game.ts): the game's systems, a run that
 * starts with the player and the camp's guards, bodies whose shapes the body lane knows,
 * and worlds the generation lane builds.
 */
export const SIGHTLINE: Game<Simulation> = {
  name: 'Sightline',
  behaviour: BEHAVIOUR,
  systems: SYSTEMS,
  simulation: (world, tuning, systems) => new Simulation(world, tuning, systems),
  start: startRun,
  still: (sim) => neutralInput(sim.player.yaw),
  bodies: (state, tuning, out) => queryBodies(state.entities, tuning, out),
  world: (spec, tuning) => generateWorld(spec, tuning),
  fingerprint: worldFingerprint,
  sample: writeSample,
};

/** Per-guard values in Snapshot.guards. */
export const GUARD_FIELDS = 6; // x, y, z, yaw, headYaw, moving

/** The slice of state the renderer needs, copied once per tick for interpolation. */
export interface Snapshot {
  tick: number;
  px: number;
  py: number;
  pz: number;
  eye: number;
  yaw: number;
  pitch: number;
  speed: number;
  /** How far through its stride the player's body is: 0 as a foot comes down (body/bob.ts). */
  step: number;
  stance: Stance;
  gait: Gait;
  /** Guard entity ids, ascending; guards appear and disappear by id. */
  guardIds: number[];
  /** Each guard's camp spawn (world.camp.guards index), parallel to guardIds. */
  guardSpawns: number[];
  /** GUARD_FIELDS values per guard, parallel to guardIds. */
  guards: Float32Array;
  /** Entities' solid shapes (copies), in entity order; their ids say whose (kernel/world/solids.ts). */
  solids: Collider[];
}

/**
 * A run of Sightline: the kernel's simulation (kernel/sim.ts) running the game, with what
 * the game's code asks of a run: the player, the guards, and the renderer's snapshot.
 * Every run has a player, always entity 1.
 */
export class Simulation extends KernelSimulation {
  /** `systems` replaces the game's own list, for tests and scenes; recordings replay with the game's. */
  constructor(world: World, tuning: Tuning, systems: readonly System[] = SYSTEMS) {
    super(world, tuning, SIGHTLINE, systems);
    this.playerEntity();
  }

  static create(seed: string, tuning: Tuning, spawnKind: SpawnKind = 'overlook'): Simulation {
    return new Simulation(generateWorld(missionSpec(seed, spawnKind), tuning), tuning);
  }

  private playerEntity(): PlayerEntity {
    return player(this.index);
  }

  /** The player's body: a live reference into the state tree. */
  get player(): BodyState {
    return this.playerEntity().body;
  }

  /** What the player's controls remember between ticks: a live reference into the state tree. */
  get playerControl(): PlayerControl {
    return this.playerEntity().control;
  }

  get playerId(): EntityId {
    return this.playerEntity().id;
  }

  /** The guards in entity order: live references into the state tree. */
  get guards(): readonly GuardEntity[] {
    return this.index.of('guard');
  }

  /** Removes an entity between ticks (a killed guard, a picked-up object); never the player. */
  override despawn(id: EntityId): boolean {
    if (id === PLAYER_ID) throw new Error('The player cannot be despawned');
    return super.despawn(id);
  }

  /** Continues from a save-state of a run of Sightline: it must have its player. */
  override restore(saved: SimState): void {
    super.restore(saved);
    this.playerEntity();
  }

  snapshot(out?: Snapshot): Snapshot {
    const guards = this.guards;
    const n = guards.length;
    const s: Snapshot =
      out && out.guards.length === n * GUARD_FIELDS
        ? out
        : {
            tick: 0,
            px: 0,
            py: 0,
            pz: 0,
            eye: 0,
            yaw: 0,
            pitch: 0,
            speed: 0,
            step: 0,
            stance: 'stand',
            gait: 'idle',
            guardIds: [],
            guardSpawns: [],
            guards: new Float32Array(n * GUARD_FIELDS),
            solids: [],
          };
    const p = this.player;
    s.tick = this.tick;
    s.px = p.x;
    s.py = p.y;
    s.pz = p.z;
    s.eye = p.eyeHeight;
    s.yaw = p.yaw;
    s.pitch = p.pitch;
    s.speed = p.speed;
    s.step = stridePhase(p, this.tuning.bodies.player, this.tuning.noise);
    s.stance = p.stance;
    s.gait = p.gait;
    s.guardIds.length = n;
    s.guardSpawns.length = n;
    for (let i = 0; i < n; i++) {
      const e = guards[i]!;
      const b = e.body;
      const o = i * GUARD_FIELDS;
      s.guardIds[i] = e.id;
      s.guardSpawns[i] = e.guard.spawn;
      s.guards[o] = b.x;
      s.guards[o + 1] = b.y;
      s.guards[o + 2] = b.z;
      s.guards[o + 3] = b.yaw;
      s.guards[o + 4] = e.guard.headYaw;
      s.guards[o + 5] = b.speed > 0.1 ? 1 : 0;
    }
    const shapes = this.solids.shapes;
    s.solids.length = shapes.length;
    for (let k = 0; k < shapes.length; k++) s.solids[k] = Object.assign(s.solids[k] ?? ({} as Collider), shapes[k]!);
    return s;
  }
}
