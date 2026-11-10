import type { Tuning } from '../../config/tuning';
import type { SimEvent } from './events';
import type { Game } from './game';
import type { InputFrame } from './input';
import { Recorder, type Recording } from './record/recording';
import type { Profiler, Simulation } from './sim';
import { withSystem, type System } from './systems';
import type { World } from './world/world';

/**
 * Scenes: a world, a setup, and what should happen in it. Each Phase 1 lab is a scene,
 * and so is every regression test that needs more than one tick: the movement course,
 * a gate that waits for bodies, a guard who should or shouldn't see you.
 *
 * A scene runs three ways from one definition:
 *   - headless, driven by its script or bot, checking its expectations
 *     (`npm run scene -- <name>`, and every scene in tests/scenes.test.ts);
 *   - in the browser, played by a person (`?scene=<name>`), with the debug view;
 *   - re-simulated from a recording of either, which names the scene and its version.
 *
 * A scene is simulation content: its world, systems and setup run inside the
 * simulation's rules (determinism, state in the tree), so a recording made in it replays
 * anywhere the scene exists in the same version. It belongs to a game (game.ts), whose
 * systems it adds to; `S` is that game's simulation.
 */

/** Drives the player in a headless run. Deterministic: the same scene gives the same input. */
export interface Driver<S extends Simulation = Simulation> {
  next(sim: S, out: InputFrame): InputFrame;
}

/** Something that should hold in a scene. Each check returns why it doesn't, or nothing. */
export interface Expectation<S extends Simulation = Simulation> {
  /** What should hold, in words: a failure is reported under it. */
  name: string;
  /** Checked after every tick, with that tick's events. */
  during?(sim: S, events: readonly SimEvent[]): string | void;
  /** Checked once, at the end of the run. */
  after?(sim: S): string | void;
}

/**
 * Names a scene in recordings: its name, its version, and its parameters. A scene made
 * from a family with parameters (a scenario: the sight scenario at 30 m, crouched, in
 * shade) is identified by them as well: a recording names them, and re-simulating it
 * makes the scene again with them. '' for a scene without.
 */
export interface SceneId {
  name: string;
  version: number;
  params: string;
}

export interface Scene<S extends Simulation = Simulation> extends Omit<SceneId, 'params'> {
  /** Its parameters, in the canonical form its factory writes them: '' or absent for none. */
  params?: string;
  /** Shown on the start screen. */
  title: string;
  description: string;
  /** The game the scene is part of: its systems run, and its setup starts the run. */
  game: Game<S>;
  /** The world: generated from a mission spec, or built by hand. Same tuning, same world. */
  world(tuning: Tuning): World;
  /**
   * A mode's numbers: the tuning this scene runs on, made from the game's (a patch over the
   * base, as docs/foundation-shape.md has modes). It must set values and not scale them, so
   * that applying it to a tuning it has already made changes nothing: a recording stores the
   * tuning its run used, and re-simulating it starts the scene with that. It never touches
   * what generation reads, so the scene's world is the same world with or without it.
   */
  tune?(tuning: Tuning): Tuning;
  /**
   * Systems the scene adds to the game's own, each in its phase: a lab's, a scripted
   * mover's, and its rules (a system in the 'mission' phase that calls `decide`).
   */
  systems?: readonly System[];
  /** Before the first tick: place the player, add entities. Runs again for every re-simulation. */
  setup?(sim: S): void;
  /** Headless runs: what drives the player, and for how long. */
  driver?(): Driver<S>;
  /** The longest a headless run lasts. It ends sooner once the rules decide, unless `playOn`. */
  seconds?: number;
  /** Keep running after the rules decide (to check what happens next). */
  playOn?: boolean;
  expect?: readonly Expectation<S>[];
}

/** Whether a headless run of the scene is over: out of time, or decided (unless it plays on). */
export function sceneOver(scene: Pick<Scene, 'playOn'>, sim: Simulation, ticks: number): boolean {
  return sim.tick >= ticks || (!scene.playOn && sim.state.outcome.status !== 'playing');
}

/** How many ticks a headless run of the scene lasts at most. */
export function sceneTicks(scene: Pick<Scene, 'seconds'>, tuning: Tuning, seconds?: number): number {
  return Math.round((seconds ?? scene.seconds ?? 10) * tuning.sim.tickHz);
}

/** The tuning a scene's run uses: the game's, with the scene's own numbers over it if it has any. */
export function sceneTuning(scene: Pick<Scene, 'tune'>, tuning: Tuning): Tuning {
  return scene.tune ? scene.tune(tuning) : tuning;
}

/** The game's systems with the scene's added, each in its phase. */
export function sceneSystems<S extends Simulation>(scene: Scene<S>): readonly System[] {
  let systems: readonly System[] = scene.game.systems;
  for (const s of scene.systems ?? []) systems = withSystem(systems, s);
  return systems;
}

/** A simulation of the scene at its first tick: world, systems and setup. Pass the world if it is already built. */
export function startScene<S extends Simulation>(scene: Scene<S>, tuning: Tuning, world: World = scene.world(tuning)): S {
  const sim = scene.game.simulation(world, sceneTuning(scene, tuning), sceneSystems(scene));
  sim.scene = { name: scene.name, version: scene.version, params: scene.params ?? '' };
  scene.setup?.(sim);
  return sim;
}

export interface SceneRun<S extends Simulation = Simulation> {
  sim: S;
  recording: Recording;
  /** Every expectation that didn't hold, with the first reason and when. */
  failures: string[];
}

/** Runs a scene headless with its driver, recording it and checking its expectations. A profiler times each system. */
export function runScene<S extends Simulation>(scene: Scene<S>, tuning: Tuning, opts: { build?: string; seconds?: number; world?: World; profiler?: Profiler } = {}): SceneRun<S> {
  const sim = startScene(scene, tuning, opts.world);
  // A scene's setup may have installed one of its own (a test watching what systems write).
  if (opts.profiler) sim.profiler = opts.profiler;
  const recorder = new Recorder(sim, opts.build ?? '');
  const driver = scene.driver?.();
  const input = scene.game.still(sim);
  const ticks = sceneTicks(scene, tuning, opts.seconds);
  const failed = new Map<string, string>();
  const check = (e: Expectation<S>, why: string | void): void => {
    if (why && !failed.has(e.name)) failed.set(e.name, `${e.name}: ${why} (tick ${sim.tick})`);
  };
  while (!sceneOver(scene, sim, ticks)) {
    const frame = driver ? driver.next(sim, input) : input;
    let events: readonly SimEvent[];
    try {
      events = sim.step(frame);
    } catch (e) {
      recorder.recordFault(sim);
      failed.set('the run', `the run: tick ${sim.tick + 1} failed: ${e instanceof Error ? e.message : String(e)}`);
      break;
    }
    recorder.record(sim, events);
    for (const e of scene.expect ?? []) if (e.during && !failed.has(e.name)) check(e, e.during(sim, events));
  }
  if (!sim.fault) for (const e of scene.expect ?? []) if (e.after && !failed.has(e.name)) check(e, e.after(sim));
  return { sim, recording: recorder.finish(sim), failures: [...failed.values()] };
}
