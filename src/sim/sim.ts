import type { Tuning } from '../config/tuning';
import { Hasher } from './core/hash';
import { Rng } from './core/rng';
import { createGuards, stepGuards, type GuardState } from './entities/guards';
import { createPlayer, stepPlayer, type MoveMode, type PlayerContext, type PlayerState, type Stance } from './entities/player';
import type { SimEvent } from './events';
import { generateWorld, type SpawnKind, type World } from './gen/world';
import { neutralInput, quantizeInput, type InputFrame } from './input';
import { missionSpec } from './mission';
import { assertTuning } from '../config/validate';

/**
 * The simulation: pure TypeScript, no rendering, no DOM, fixed timestep.
 *
 * The browser, the headless runner and the tests all drive the same Simulation. Given
 * the same seed, tuning and input frames, it produces bit-identical states in the same
 * JavaScript engine, which is what makes recordings re-playable and bugs reproducible.
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
  guards: Float32Array;
}

export class Simulation {
  readonly world: World;
  readonly dt: number;
  tuning: Tuning;
  tick = 0;
  readonly player: PlayerState;
  readonly guards: GuardState[];
  private readonly rng: Rng;
  private readonly events: SimEvent[] = [];
  private readonly ctx: PlayerContext;
  /** The exact (quantized) input the last tick ran on. Recorders store this. */
  readonly lastInput: InputFrame = neutralInput();

  constructor(world: World, tuning: Tuning) {
    assertTuning(tuning);
    this.world = world;
    this.tuning = tuning;
    this.dt = 1 / tuning.sim.tickHz;
    this.rng = new Rng(world.seed, 'sim');
    this.player = createPlayer(world, tuning);
    this.guards = createGuards(world);
    this.ctx = {
      world,
      tuning,
      dt: this.dt,
      tick: 0,
      guards: this.guards,
      emit: (e) => this.events.push(e),
    };
  }

  static create(seed: string, tuning: Tuning, spawn: SpawnKind = 'overlook'): Simulation {
    return new Simulation(generateWorld(missionSpec(seed, spawn), tuning), tuning);
  }

  /**
   * Advances one tick. The input is quantized first (8-bit axes, 32-bit angles), exactly
   * as a recording stores it, so any caller's run can be recorded and replayed.
   * Returns this tick's events; the array is reused, so copy any event you keep.
   */
  step(input: InputFrame): readonly SimEvent[] {
    quantizeInput(input, this.lastInput);
    this.events.length = 0;
    this.tick++;
    this.ctx.tick = this.tick;
    this.ctx.tuning = this.tuning;
    stepGuards(this.guards, this.world, this.tuning, this.dt, this.tick, this.rng, this.ctx.emit);
    stepPlayer(this.player, this.lastInput, this.ctx);
    return this.events;
  }

  /** Swaps in new tuning (hot reload). World values need a new Simulation instead. */
  setTuning(tuning: Tuning): void {
    assertTuning(tuning);
    this.tuning = tuning;
  }

  snapshot(out?: Snapshot): Snapshot {
    const n = this.guards.length * GUARD_FIELDS;
    const s: Snapshot =
      out && out.guards.length === n
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
            guards: new Float32Array(n),
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
    for (let i = 0; i < this.guards.length; i++) {
      const g = this.guards[i]!;
      const o = i * GUARD_FIELDS;
      s.guards[o] = g.x;
      s.guards[o + 1] = g.y;
      s.guards[o + 2] = g.z;
      s.guards[o + 3] = g.yaw;
      s.guards[o + 4] = g.headYaw;
      s.guards[o + 5] = g.moving ? 1 : 0;
    }
    return s;
  }

  /** A hash of the complete dynamic state, for determinism checks. */
  hash(): string {
    const h = new Hasher();
    const p = this.player;
    h.u32(this.tick);
    h.f64(p.x).f64(p.y).f64(p.z).f64(p.vx).f64(p.vy).f64(p.vz).f64(p.yaw).f64(p.pitch);
    h.str(p.stance).f64(p.stanceTimer).f64(p.stanceDuration).f64(p.eyeFrom).f64(p.eyeHeight).f64(p.stride);
    h.u32(p.grounded ? 1 : 0).u32(p.standingOn + 1).u32(p.proneTransition ? 1 : 0).str(p.queuedStance ?? '');
    h.u32(p.sprintHeld ? 1 : 0).u32(p.sprintSuppressed ? 1 : 0);
    for (const g of this.guards) {
      h.f64(g.x).f64(g.y).f64(g.z).f64(g.yaw).f64(g.headYaw).u32(g.waypoint).f64(g.wait).f64(g.stride).f64(g.scanTime);
    }
    for (const w of this.rng.stateWords()) h.u32(w);
    return h.digest();
  }
}
