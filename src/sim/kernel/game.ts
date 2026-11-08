import type { Tuning } from '../../config/tuning';
import type { InputFrame } from './input';
import type { MissionSpec } from './mission';
import type { ByteWriter } from './record/bytes';
import type { Simulation } from './sim';
import type { SimState } from './state';
import type { System } from './systems';
import type { QueryBody } from './world/query';
import type { World } from './world/world';

/**
 * What a game gives the kernel. The kernel runs ticks, keeps the state tree, and records,
 * re-simulates and seeks runs; the game says what a run is: which systems run, what every
 * run starts with, which entities have bodies, and how its worlds are built and told
 * apart. This interface is the kernel's whole dependency on a game, which is why the
 * kernel imports none.
 *
 * Sightline's is SIGHTLINE (game/sim.ts). The kernel alone (alone.ts) is a game with no
 * lanes at all, which shows that the kernel stands on its own.
 */
export interface Game<S extends Simulation = Simulation> {
  /** Names the game, in messages. */
  readonly name: string;
  /** The systems every tick runs, phase by phase (systems.ts). */
  readonly systems: readonly System[];
  /** A simulation of this game in a world: with its own systems, or a scene's or a test's. */
  simulation(world: World, tuning: Tuning, systems?: readonly System[]): S;
  /** Before the first tick: spawns what every run starts with, in id order. Runs again for every re-simulation. */
  start(sim: Simulation): void;
  /** The input of a player who touches nothing: what a scene with no driver runs on, and what drivers start from. */
  still(sim: S): InputFrame;
  /** Every body's shape as it stands now, for queries (world/query.ts): one per entity with a body, reusing `out`. */
  bodies(state: SimState, tuning: Tuning, out: QueryBody[]): QueryBody[];
  /** Builds the world a mission spec names: re-simulating a recording of a plain mission needs it. */
  world(spec: MissionSpec, tuning: Tuning): World;
  /** A fingerprint of everything the world's builder decided, so a recording made in another world is refused. */
  fingerprint(world: World): string;
  /** Writes one sample of a recording's 10 Hz state track (STAT), read by the replay and telemetry without re-simulating. */
  sample(w: ByteWriter, sim: Simulation): void;
}
