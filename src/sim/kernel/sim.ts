import type { Tuning } from '../../config/tuning';
import { assertTuning, frozenTuning } from '../../config/validate';
import { Rng } from './core/rng';
import { DebugCanvas, type DebugDraw } from './debugDraw';
import type { EventDraft, SimEvent } from './events';
import type { Game } from './game';
import { neutralInput, quantizeInput, type InputFrame, type TickInput } from './input';
import type { SceneId } from './scene';
import { EntityIndex, STATE_SCHEMA, cloneState, despawn, emptyState, hasSolid, hashState, spawn, type Entity, type EntityId, type SimState } from './state';
import { planSystems, scheduleIn, type System, type TickContext } from './systems';
import type { QueryBody, QueryView } from './world/query';
import { Solids, solidId } from './world/solids';
import type { World } from './world/world';
import { WORK_KINDS, noWork, type WorkCounts } from './work';

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
 *
 * This is the kernel's simulation, which knows no lane and no game. What a run is comes
 * from its game (game.ts): the systems, what every run starts with, which entities have
 * bodies. Sightline's simulation (game/sim.ts) extends this one with the game's own view
 * of a run: the player, the guards, the renderer's snapshot.
 */

/** Receives each system's start and end, to time them. The caller owns the clock. */
export interface Profiler {
  begin(system: System): void;
  end(system: System): void;
}

/**
 * Why a simulation stopped: a system threw partway through a tick. The state is left
 * partway through that tick too, so the simulation refuses to go on; continuing would
 * quietly part ways with any recording of the run. A recording made up to the fault
 * keeps the failing tick, and re-simulating it fails the same way (record/resim.ts).
 */
export interface SimFault {
  /** The tick that failed. */
  tick: number;
  /** The system that threw. */
  system: string;
  message: string;
}

export class Simulation {
  readonly world: World;
  /** The game this simulation runs: its systems, its setup, its bodies (game.ts). */
  readonly game: Game;
  /** Everything solid now: the world's colliders and the entities' shapes, read live from the state. */
  readonly solids: Solids;
  readonly dt: number;
  private current: Tuning;
  /** All dynamic state. Systems write into it; nothing else holds simulation state. */
  state: SimState;
  /** The entities by kind and id: a cache rebuilt from the state whenever entities appear or vanish, or the state is restored. */
  readonly index = new EntityIndex();
  /** The exact (quantized) input the last tick ran on. Recorders store this. */
  readonly lastInput: TickInput = neutralInput();
  /** Set to time each system (`npm run sim -- --profile`). */
  profiler: Profiler | null = null;
  /** Set when a tick failed; the simulation runs no further ticks (restore() clears it). */
  fault: SimFault | null = null;
  /**
   * What systems drew for the debug view in the last tick (debugDraw.ts), while
   * `drawDebug` is on. Not state: never read back by the simulation.
   */
  readonly debugCanvas = new DebugCanvas();
  /** Collect systems' debug drawings (the debug view is on). */
  drawDebug = false;
  /** The scene this simulation runs (scene.ts), if any: recordings name it so they can be re-simulated. */
  scene: SceneId | null = null;
  readonly systems: readonly System[];
  /** Ticks between runs, per system. */
  private readonly every: number[];
  /** Draws for every entity's streams: loaded from the state tree, used, written back. */
  private readonly draws = new Rng('', 'draws');
  private readonly events: SimEvent[] = [];
  /** This tick's channels (TickContext.channel): emptied before every tick. */
  private readonly channels = new Map<string, unknown>();
  /** The system running now, whose declared events are the only ones it may emit. */
  private running: System | null = null;
  /** All work counted so far, and how much of it each system did (by position in `systems`). */
  private readonly counts = noWork();
  private readonly bySystem: WorkCounts[];
  private readonly view: { world: World; solids: Solids; bodies: QueryBody[]; work: WorkCounts };
  private readonly ctx: { -readonly [K in keyof TickContext]: TickContext[K] };

  /** `systems` replaces the game's own list, for tests and scenes; recordings replay with the game's. */
  constructor(world: World, tuning: Tuning, game: Game, systems: readonly System[] = game.systems) {
    assertTuning(tuning);
    this.world = world;
    this.game = game;
    this.solids = new Solids(world.colliders);
    this.view = { world, solids: this.solids, bodies: [], work: this.counts };
    this.current = frozenTuning(tuning);
    this.dt = 1 / tuning.sim.tickHz;
    this.systems = systems;
    this.every = planSystems(systems, tuning.sim.tickHz);
    this.bySystem = systems.map(noWork);
    this.state = emptyState();
    this.reindex();
    const ctx = {
      world,
      solids: this.solids,
      tuning: this.current,
      dt: this.dt,
      tick: 0,
      state: this.state,
      index: this.index,
      input: this.lastInput,
      work: this.counts,
      events: this.events,
      emit: (draft: EventDraft): number => {
        const system = this.running;
        if (system && !system.emits.includes(draft.type)) throw new Error(`System '${system.name}' emitted '${draft.type}', which it doesn't declare`);
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
      debug: (paint: (draw: DebugDraw) => void): void => {
        if (this.drawDebug) paint(this.debugCanvas);
      },
      draw: <T>(id: EntityId, purpose: string, use: (rng: Rng) => T): T => {
        const key = `${id}.${purpose}`;
        const words = ctx.state.rng[key] ?? new Rng(world.seed, `entity${id}`).fork(purpose).stateWords();
        this.draws.setStateWords(words);
        const out = use(this.draws);
        ctx.state.rng[key] = this.draws.stateWords();
        return out;
      },
      query: (): QueryView => this.queryView(),
      spawn: <E extends Entity>(make: (id: EntityId) => E): E => {
        this.mayChangeEntities('spawned');
        return this.spawn(make);
      },
      despawn: (id: EntityId): boolean => {
        this.mayChangeEntities('despawned');
        return this.despawn(id);
      },
      channel: <T>(name: string, make: () => T): T => {
        let v = this.channels.get(name) as T | undefined;
        if (v === undefined) this.channels.set(name, (v = make()));
        return v;
      },
    };
    this.ctx = ctx;
    // What every run starts with: the game spawns it, in id order.
    game.start(this);
  }

  get tick(): number {
    return this.state.tick;
  }

  /** The tuning this simulation runs on: a frozen copy. Change it with setTuning. */
  get tuning(): Tuning {
    return this.current;
  }

  /** Inside a tick, only a system that declares it writes `entities` may spawn or despawn. */
  private mayChangeEntities(what: string): void {
    const system = this.running;
    if (system && !system.writes.includes('entities')) throw new Error(`System '${system.name}' ${what} an entity, which it doesn't declare (writes: entities)`);
  }

  /** Rebuilds the caches derived from the state tree (after spawning, despawning or restoring). */
  private reindex(): void {
    this.index.rebuild(this.state.entities);
    this.solids.track(this.state.entities.filter(hasSolid).map((e) => e.solid));
  }

  /**
   * Advances one tick. The input is quantized first (8-bit axes, 32-bit angles), exactly
   * as a recording stores it, so any caller's run can be recorded and replayed.
   * Returns this tick's events; the array is reused, so copy any event you keep.
   */
  step(input: InputFrame): readonly SimEvent[] {
    if (this.fault) throw new Error(`The simulation stopped at tick ${this.fault.tick}, in ${this.fault.system}: ${this.fault.message}`);
    quantizeInput(input, this.lastInput);
    this.events.length = 0;
    this.debugCanvas.clear();
    this.channels.clear();
    const s = this.state;
    const tick = s.tick + 1;
    const ctx = this.ctx;
    ctx.tick = tick;
    ctx.tuning = this.tuning;
    ctx.state = s;
    const prof = this.profiler;
    let k = 0;
    try {
      for (; k < this.systems.length; k++) {
        const every = this.every[k]!;
        if (tick % every !== 0) continue;
        const system = this.systems[k]!;
        this.running = system;
        const w = this.counts;
        const rays = w.rays;
        const nodes = w.nodes;
        const bodies = w.bodies;
        prof?.begin(system);
        system.run(ctx, this.dt * every);
        prof?.end(system);
        const mine = this.bySystem[k]!;
        mine.rays += w.rays - rays;
        mine.nodes += w.nodes - nodes;
        mine.bodies += w.bodies - bodies;
      }
    } catch (e) {
      this.fault = { tick, system: this.systems[k]?.name ?? '?', message: e instanceof Error ? e.message : String(e) };
      throw e;
    } finally {
      this.running = null;
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

  /**
   * Adds an entity, with the next id: between ticks (a scene's gate, a test's crate), or
   * inside one through the TickContext. An entity with a solid shape gets its collider id
   * from its entity id, and must not be placed inside a body (world/solids.ts).
   */
  spawn<E extends Entity>(make: (id: EntityId) => E): E {
    const e = spawn(this.state, make);
    if (hasSolid(e)) e.solid.id = solidId(e.id);
    this.reindex();
    return e;
  }

  /** Removes an entity (a killed guard, a picked-up object), between ticks or inside one. Returns false if there was none. */
  despawn(id: EntityId): boolean {
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
    this.fault = null;
    this.reindex();
  }

  /** Every body's shape as it stands now, for queries (world/query.ts): the game's bodies (game.ts). Reuses `out` and its shapes. */
  queryBodies(out: QueryBody[] = []): QueryBody[] {
    return this.game.bodies(this.state, this.current, out);
  }

  /** What queries look through now: the world, everything solid, and every body's shape (world/query.ts). Reused. */
  queryView(): QueryView {
    this.queryBodies(this.view.bodies);
    return this.view;
  }

  /**
   * The work each system has done since the simulation began (work.ts), in running order.
   * Deterministic, like the state, but not part of it: a restore doesn't rewind it.
   */
  work(): Array<{ system: string; phase: System['phase'] } & WorkCounts> {
    return this.systems.map((s, k) => {
      const w = this.bySystem[k]!;
      const out = { system: s.name, phase: s.phase, ...noWork() };
      for (const kind of WORK_KINDS) out[kind] = w[kind];
      return out;
    });
  }

  /** A hash of the complete dynamic state, for determinism checks: the whole state tree. */
  hash(): string {
    return hashState(this.state);
  }
}
