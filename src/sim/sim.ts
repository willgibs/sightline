import type { Tuning } from '../config/tuning';
import { assertTuning } from '../config/validate';
import { Hasher } from './core/hash';
import { Rng } from './core/rng';
import { createGuard, stepGuards, type GuardState } from './entities/guards';
import { createPlayer, stepPlayer, type MoveMode, type PlayerContext, type PlayerState, type Stance } from './entities/player';
import type { SimEvent } from './events';
import { generateWorld, type SpawnKind, type World } from './gen/world';
import { neutralInput, quantizeInput, type InputFrame } from './input';
import { missionSpec } from './mission';
import {
  Faction,
  PLAYER_ID,
  STATE_SCHEMA,
  cloneState,
  emptyState,
  hashState,
  spawn,
  type EntityId,
  type GuardEntity,
  type PlayerEntity,
  type SimState,
} from './state';

/**
 * The simulation: pure TypeScript, no rendering, no DOM, fixed timestep.
 *
 * The browser, the headless runner and the tests all drive the same Simulation. Given
 * the same world, tuning and input frames, it produces bit-identical states in every
 * JavaScript engine, which is what makes recordings re-playable and bugs reproducible.
 *
 * All dynamic state lives in `state`, one tree of plain data (see state.ts). Save it
 * with `saveState()`, put it back with `restore()`, and the run continues bit for bit.
 */

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
  stance: Stance;
  mode: MoveMode;
  /** Guard entity ids, ascending; guards appear and disappear by id. */
  guardIds: number[];
  /** Each guard's camp spawn (world.camp.guards index), parallel to guardIds. */
  guardSpawns: number[];
  /** GUARD_FIELDS values per guard, parallel to guardIds. */
  guards: Float32Array;
}

export class Simulation {
  readonly world: World;
  readonly dt: number;
  tuning: Tuning;
  /** All dynamic state. Systems write into it; nothing else holds simulation state. */
  state: SimState;
  private readonly rng: Rng;
  private readonly events: SimEvent[] = [];
  private readonly ctx: PlayerContext;
  private playerEntity!: PlayerEntity;
  private guardEntities: GuardEntity[] = [];
  private guardStates: GuardState[] = [];
  /** The exact (quantized) input the last tick ran on. Recorders store this. */
  readonly lastInput: InputFrame = neutralInput();

  constructor(world: World, tuning: Tuning) {
    assertTuning(tuning);
    this.world = world;
    this.tuning = tuning;
    this.dt = 1 / tuning.sim.tickHz;
    this.rng = new Rng(world.seed, 'sim');
    const s = emptyState();
    spawn(s, (id): PlayerEntity => ({ id, kind: 'player', faction: Faction.Player, player: createPlayer(world, tuning) }));
    for (let i = 0; i < world.camp.guards.length; i++) {
      spawn(s, (id): GuardEntity => ({ id, kind: 'guard', faction: Faction.Camp, guard: createGuard(world, i) }));
    }
    s.rng.sim = this.rng.stateWords();
    this.state = s;
    this.ctx = {
      world,
      tuning,
      dt: this.dt,
      tick: 0,
      guards: this.guardStates,
      emit: (e) => this.events.push(e),
    };
    this.reindex();
  }

  static create(seed: string, tuning: Tuning, spawnKind: SpawnKind = 'overlook'): Simulation {
    return new Simulation(generateWorld(missionSpec(seed, spawnKind), tuning), tuning);
  }

  get tick(): number {
    return this.state.tick;
  }

  /** The player's body: a live reference into the state tree. */
  get player(): PlayerState {
    return this.playerEntity.player;
  }

  get playerId(): EntityId {
    return this.playerEntity.id;
  }

  /** Guard bodies in entity order: live references into the state tree. */
  get guards(): readonly GuardState[] {
    return this.guardStates;
  }

  /** Rebuilds the caches derived from the state tree (after spawning, despawning or restoring). */
  private reindex(): void {
    const player = this.state.entities.find((e): e is PlayerEntity => e.kind === 'player');
    if (!player || player.id !== PLAYER_ID) throw new Error('Simulation state has no player');
    this.playerEntity = player;
    this.guardEntities = this.state.entities.filter((e): e is GuardEntity => e.kind === 'guard');
    this.guardStates.length = 0;
    for (const g of this.guardEntities) this.guardStates.push(g.guard);
  }

  /**
   * Advances one tick. The input is quantized first (8-bit axes, 32-bit angles), exactly
   * as a recording stores it, so any caller's run can be recorded and replayed.
   * Returns this tick's events; the array is reused, so copy any event you keep.
   */
  step(input: InputFrame): readonly SimEvent[] {
    quantizeInput(input, this.lastInput);
    this.events.length = 0;
    const s = this.state;
    const tick = s.tick + 1;
    this.ctx.tick = tick;
    this.ctx.tuning = this.tuning;
    this.rng.setStateWords(s.rng.sim!);
    stepGuards(this.guardEntities, this.world, this.tuning, this.dt, tick, this.rng, this.ctx.emit);
    stepPlayer(this.player, this.lastInput, this.ctx);
    s.rng.sim = this.rng.stateWords();
    // Only a tick that completed counts, so a failure mid-tick never desynchronizes recorders.
    s.tick = tick;
    return this.events;
  }

  /** Swaps in new tuning (hot reload). World values need a new Simulation instead. */
  setTuning(tuning: Tuning): void {
    assertTuning(tuning);
    this.tuning = tuning;
  }

  /** A save-state: a deep copy of everything dynamic. */
  saveState(): SimState {
    return cloneState(this.state);
  }

  /** Continues from a save-state taken from a simulation of the same world and tuning. */
  restore(saved: SimState): void {
    if (saved.schema !== STATE_SCHEMA) throw new Error(`Save-state schema ${saved.schema} is not ${STATE_SCHEMA}`);
    this.state = cloneState(saved);
    this.reindex();
  }

  snapshot(out?: Snapshot): Snapshot {
    const n = this.guardEntities.length;
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
            stance: 'stand',
            mode: 'idle',
            guardIds: [],
            guardSpawns: [],
            guards: new Float32Array(n * GUARD_FIELDS),
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
    s.stance = p.stance;
    s.mode = p.mode;
    s.guardIds.length = n;
    s.guardSpawns.length = n;
    for (let i = 0; i < n; i++) {
      const e = this.guardEntities[i]!;
      const g = e.guard;
      const o = i * GUARD_FIELDS;
      s.guardIds[i] = e.id;
      s.guardSpawns[i] = g.spawn;
      s.guards[o] = g.x;
      s.guards[o + 1] = g.y;
      s.guards[o + 2] = g.z;
      s.guards[o + 3] = g.yaw;
      s.guards[o + 4] = g.headYaw;
      s.guards[o + 5] = g.moving ? 1 : 0;
    }
    return s;
  }

  /** A hash of the complete dynamic state, for determinism checks: the whole state tree. */
  hash(): string {
    return hashState(this.state);
  }

  /**
   * The hash Phase 0 used, field by field. Kept so restructuring can be proven to change
   * nothing: a refactor must reproduce it bit for bit on the same runs.
   */
  legacyHash(): string {
    const h = new Hasher();
    const p = this.player;
    h.u32(this.tick);
    h.f64(p.x).f64(p.y).f64(p.z).f64(p.vx).f64(p.vy).f64(p.vz).f64(p.yaw).f64(p.pitch);
    h.str(p.stance).f64(p.stanceTimer).f64(p.stanceDuration).f64(p.eyeFrom).f64(p.eyeHeight).f64(p.stride);
    h.u32(p.grounded ? 1 : 0).u32(p.standingOn + 1).u32(p.proneTransition ? 1 : 0).str(p.queuedStance ?? '');
    h.u32(p.sprintSuppressed ? 1 : 0).u32(p.sliding ? 1 : 0);
    for (const g of this.guardStates) {
      h.f64(g.x).f64(g.y).f64(g.z).f64(g.yaw).f64(g.headYaw).u32(g.waypoint).f64(g.wait).f64(g.stride).f64(g.scanTime);
    }
    for (const w of this.state.rng.sim!) h.u32(w);
    return h.digest();
  }
}
