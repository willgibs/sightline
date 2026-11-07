import type { Tuning } from '../config/tuning';
import { assertTuning, frozenTuning } from '../config/validate';
import { Rng } from './core/rng';
import { createGuard } from './entities/guards';
import { createPlayer, type PlayerControl } from './entities/player';
import type { EventDraft, SimEvent } from './events';
import { generateWorld, type SpawnKind, type World } from './gen/world';
import { neutralInput, quantizeInput, type InputFrame, type TickInput } from './input';
import { missionSpec } from './mission';
import type { BodyState, Gait, Stance } from './motor/body';
import type { MoveIntent } from './motor/motor';
import {
  Faction,
  PLAYER_ID,
  STATE_SCHEMA,
  cloneState,
  despawn,
  emptyState,
  hashState,
  spawn,
  type EntityId,
  type GuardEntity,
  type PlayerEntity,
  type SimState,
} from './state';
import { SYSTEMS, planSystems, scheduleIn, type EntityIndex, type System, type TickContext } from './systems';

/**
 * The simulation: pure TypeScript, no rendering, no DOM, fixed timestep.
 *
 * The browser, the headless runner and the tests all drive the same Simulation. Given
 * the same world, tuning and input frames, it produces bit-identical states in every
 * JavaScript engine, which is what makes recordings re-playable and bugs reproducible.
 *
 * All dynamic state lives in `state`, one tree of plain data (see state.ts). Save it
 * with `saveState()`, put it back with `restore()`, and the run continues bit for bit.
 * A tick runs the systems in systems.ts, phase by phase.
 */

/** Receives each system's start and end, to time them. The caller owns the clock. */
export interface Profiler {
  begin(system: System): void;
  end(system: System): void;
}

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
  gait: Gait;
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
  private current: Tuning;
  /** All dynamic state. Systems write into it; nothing else holds simulation state. */
  state: SimState;
  /** The exact (quantized) input the last tick ran on. Recorders store this. */
  readonly lastInput: TickInput = neutralInput();
  /** Set to time each system (`npm run sim -- --profile`). */
  profiler: Profiler | null = null;
  readonly systems: readonly System[];
  /** Ticks between runs, per system. */
  private readonly every: number[];
  /** Draws for every entity's streams: loaded from the state tree, used, written back. */
  private readonly draws = new Rng('', 'draws');
  private readonly events: SimEvent[] = [];
  private readonly intents = new Map<EntityId, MoveIntent>();
  private index!: EntityIndex;
  private readonly ctx: { -readonly [K in keyof TickContext]: TickContext[K] };

  /** `systems` replaces the game's own list, for tests and scenes; recordings replay with the default. */
  constructor(world: World, tuning: Tuning, systems: readonly System[] = SYSTEMS) {
    assertTuning(tuning);
    this.world = world;
    this.current = frozenTuning(tuning);
    this.dt = 1 / tuning.sim.tickHz;
    this.systems = systems;
    this.every = planSystems(systems, tuning.sim.tickHz);
    const s = emptyState();
    spawn(s, (id): PlayerEntity => ({ id, kind: 'player', faction: Faction.Player, ...createPlayer(world, tuning) }));
    for (let i = 0; i < world.camp.guards.length; i++) {
      spawn(s, (id): GuardEntity => ({ id, kind: 'guard', faction: Faction.Camp, ...createGuard(world, i, this.current) }));
    }
    this.state = s;
    this.reindex();
    const ctx = {
      world,
      tuning,
      dt: this.dt,
      tick: 0,
      state: s,
      index: this.index,
      input: this.lastInput,
      intents: this.intents,
      emit: (draft: EventDraft): number => {
        // The draft becomes the event: numbered, stamped with its tick and, unless the
        // emitter knows the moment within the tick, the tick's end.
        const e = draft as SimEvent;
        e.id = ctx.state.nextEventId++;
        e.tick = ctx.tick;
        e.t = draft.t ?? ctx.tick / this.tuning.sim.tickHz;
        e.cause = draft.cause ?? 0;
        this.events.push(e);
        return e.id;
      },
      schedule: (seconds: number, kind: string, a = 0, b = 0) => scheduleIn(ctx.state, ctx.tick, ctx.dt, seconds, kind, a, b),
      draw: <T>(id: EntityId, purpose: string, use: (rng: Rng) => T): T => {
        const key = `${id}.${purpose}`;
        const words = ctx.state.rng[key] ?? new Rng(world.seed, `entity${id}`).fork(purpose).stateWords();
        this.draws.setStateWords(words);
        const out = use(this.draws);
        ctx.state.rng[key] = this.draws.stateWords();
        return out;
      },
    };
    this.ctx = ctx;
  }

  static create(seed: string, tuning: Tuning, spawnKind: SpawnKind = 'overlook'): Simulation {
    return new Simulation(generateWorld(missionSpec(seed, spawnKind), tuning), tuning);
  }

  get tick(): number {
    return this.state.tick;
  }

  /** The tuning this simulation runs on: a frozen copy. Change it with setTuning. */
  get tuning(): Tuning {
    return this.current;
  }

  /** The player's body: a live reference into the state tree. */
  get player(): BodyState {
    return this.index.player.body;
  }

  /** What the player's controls remember between ticks: a live reference into the state tree. */
  get playerControl(): PlayerControl {
    return this.index.player.control;
  }

  get playerId(): EntityId {
    return this.index.player.id;
  }

  /** The guards in entity order: live references into the state tree. */
  get guards(): readonly GuardEntity[] {
    return this.index.guards;
  }

  /** Rebuilds the caches derived from the state tree (after spawning, despawning or restoring). */
  private reindex(): void {
    const player = this.state.entities.find((e): e is PlayerEntity => e.kind === 'player');
    if (!player || player.id !== PLAYER_ID) throw new Error('Simulation state has no player');
    const guards = this.state.entities.filter((e): e is GuardEntity => e.kind === 'guard');
    this.index = { player, guards };
    this.intents.clear();
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
    const ctx = this.ctx;
    ctx.tick = tick;
    ctx.tuning = this.tuning;
    ctx.state = s;
    ctx.index = this.index;
    const prof = this.profiler;
    for (let k = 0; k < this.systems.length; k++) {
      const every = this.every[k]!;
      if (tick % every !== 0) continue;
      const system = this.systems[k]!;
      prof?.begin(system);
      system.run(ctx, this.dt * every);
      prof?.end(system);
    }
    // Only a tick that completed counts, so a failure mid-tick never desynchronizes recorders.
    s.tick = tick;
    return this.events;
  }

  /** Swaps in new tuning (hot reload). World values need a new Simulation instead. */
  setTuning(tuning: Tuning): void {
    assertTuning(tuning);
    this.current = frozenTuning(tuning);
  }

  /** Removes an entity between ticks (a killed guard, a picked-up object). Returns false if there was none. */
  despawn(id: EntityId): boolean {
    if (id === PLAYER_ID) throw new Error('The player cannot be despawned');
    const removed = despawn(this.state, id);
    if (removed) this.reindex();
    return removed;
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
    const guards = this.index.guards;
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
            stance: 'stand',
            gait: 'idle',
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
    return s;
  }

  /** A hash of the complete dynamic state, for determinism checks: the whole state tree. */
  hash(): string {
    return hashState(this.state);
  }
}
