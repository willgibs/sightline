import type { Tuning } from '../config/tuning';
import type { SimEvent } from './events';
import type { World } from './gen/world';
import { neutralInput, type InputFrame } from './input';
import { createBody } from './motor/body';
import { Recorder, type Recording } from './record/recording';
import { Simulation } from './sim';
import { SYSTEMS, withSystem, type System } from './systems';

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
 * anywhere the scene exists in the same version.
 */

/** Drives the player in a headless run. Deterministic: the same scene gives the same input. */
export interface Driver {
  next(sim: Simulation, out: InputFrame): InputFrame;
}

/** Something that should hold in a scene. Each check returns why it doesn't, or nothing. */
export interface Expectation {
  /** What should hold, in words: a failure is reported under it. */
  name: string;
  /** Checked after every tick, with that tick's events. */
  during?(sim: Simulation, events: readonly SimEvent[]): string | void;
  /** Checked once, at the end of the run. */
  after?(sim: Simulation): string | void;
}

/** Names a scene and its version in recordings. */
export interface SceneId {
  name: string;
  version: number;
}

export interface Scene extends SceneId {
  /** Shown on the start screen. */
  title: string;
  description: string;
  /** The world: generated from a mission spec, or built by hand (gen/handmade.ts). Same tuning, same world. */
  world(tuning: Tuning): World;
  /** Systems the scene adds to the game's own, each in its phase (a lab's, a scripted mover's). */
  systems?: readonly System[];
  /** Before the first tick: place the player, add entities. Runs again for every re-simulation. */
  setup?(sim: Simulation): void;
  /** Headless runs: what drives the player, and for how long. */
  driver?(): Driver;
  seconds?: number;
  expect?: readonly Expectation[];
}

/** The game's systems with the scene's added, each in its phase. */
export function sceneSystems(scene: Scene): readonly System[] {
  let systems: readonly System[] = SYSTEMS;
  for (const s of scene.systems ?? []) systems = withSystem(systems, s);
  return systems;
}

/** A simulation of the scene at its first tick: world, systems and setup. Pass the world if it is already built. */
export function startScene(scene: Scene, tuning: Tuning, world: World = scene.world(tuning)): Simulation {
  const sim = new Simulation(world, tuning, sceneSystems(scene));
  sim.scene = { name: scene.name, version: scene.version };
  scene.setup?.(sim);
  return sim;
}

/** Setup: puts the player at (x, z), facing (faceX, faceZ), standing where a body would stand there. */
export function placePlayer(sim: Simulation, x: number, z: number, faceX = 0, faceZ = -1): void {
  if (sim.tick !== 0) throw new Error('placePlayer is for setup, before the first tick');
  const body = createBody(sim.world, sim.solids, sim.tuning.bodies.player, x, z, faceX, faceZ);
  Object.assign(sim.player, body);
}

export interface SceneRun {
  sim: Simulation;
  recording: Recording;
  /** Every expectation that didn't hold, with the first reason and when. */
  failures: string[];
}

/** Runs a scene headless with its driver, recording it and checking its expectations. */
export function runScene(scene: Scene, tuning: Tuning, opts: { build?: string; seconds?: number; world?: World } = {}): SceneRun {
  const sim = startScene(scene, tuning, opts.world);
  const recorder = new Recorder(sim, opts.build ?? '');
  const driver = scene.driver?.();
  const input = neutralInput(sim.player.yaw);
  const ticks = Math.round((opts.seconds ?? scene.seconds ?? 10) * tuning.sim.tickHz);
  const failed = new Map<string, string>();
  const check = (e: Expectation, why: string | void): void => {
    if (why && !failed.has(e.name)) failed.set(e.name, `${e.name}: ${why} (tick ${sim.tick})`);
  };
  for (let i = 0; i < ticks; i++) {
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
