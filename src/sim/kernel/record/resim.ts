import type { SimEvent } from '../events';
import type { Game } from '../game';
import { neutralInput } from '../input';
import { startScene, type Scene } from '../scene';
import type { Simulation } from '../sim';
import type { System } from '../systems';
import type { World } from '../world/world';
import { STATE_SCHEMA, stateParts } from '../state';
import { GEN_VERSION, SIM_VERSION } from '../version';
import { hashOrZeros, type Recording } from './recording';

export interface ResimResult {
  ok: boolean;
  ticks: number;
  finalHash: string;
  expectedHash: string;
  /** Why the recording can't be re-simulated in this build, if it can't. */
  problem: string | null;
  /** Tick of the first checkpoint that disagreed, if any. */
  firstDivergence: number | null;
  /** The parts of the state that disagreed there: 'guard:4', 'rng', 'player:1'. */
  divergedParts: string[];
  /**
   * For a recording that ended in a fault: what re-simulating its last tick did. ok
   * requires the same system to fail with the same message, leaving the same state.
   */
  fault: { expected: string; got: string | null } | null;
  ms: number;
}

export interface ReplayOptions<S extends Simulation = Simulation> {
  /** The game the recording was made in (a scene names its own): its systems, its setup, its worlds. */
  game?: Game<S>;
  /** The world, already built: skips building it again. */
  world?: World;
  /** The scene the recording names, from the build's scenes (game/scenes/index.ts): its world, systems and setup. */
  scene?: Scene<S>;
  /** For a run that wasn't a scene: the systems it ran with, if not the game's own (tests). */
  systems?: readonly System[];
  /** Milliseconds, to time the run. */
  clock?: () => number;
  /** Called around each re-simulated tick, to watch the run (npm run playtest). Must only look. */
  watch?: { before?(sim: S): void; after?(sim: S, events: readonly SimEvent[]): void };
}

/**
 * The simulation a recording starts from, or why this build can't make it: the
 * versions, the scene, the valley's fingerprint and the first state must all agree.
 */
export function replaySimulation<S extends Simulation = Simulation>(rec: Recording, opts: ReplayOptions<S> = {}): S | string {
  const h = rec.header;
  if (h.simVersion !== SIM_VERSION || h.stateSchema !== STATE_SCHEMA || h.genVersion !== GEN_VERSION) {
    return (
      `made by a build with simulation ${h.simVersion}, state ${h.stateSchema}, generation ${h.genVersion}; ` +
      `this build has ${SIM_VERSION}, ${STATE_SCHEMA}, ${GEN_VERSION}${h.build ? ` (it was ${h.build})` : ''}`
    );
  }
  const scene = opts.scene;
  if (h.scene && (!scene || scene.name !== h.scene.name)) return `made in the scene '${h.scene.name}', which this build doesn't have`;
  if (h.scene && scene && scene.version !== h.scene.version) return `made in version ${h.scene.version} of the scene '${h.scene.name}'; this build has version ${scene.version}`;
  const game = h.scene && scene ? scene.game : opts.game;
  if (!game) return 'no game was given to re-simulate it in';
  if (h.behaviour !== game.behaviour) {
    return `made by a build that behaves differently (behaviour ${h.behaviour}; this build's is ${game.behaviour})${h.build ? `: replay it with ${h.build}` : ''}`;
  }
  if (!h.scene && !opts.world && h.mission.terrain.kind !== 'procedural') return `its world '${h.mission.terrain.name}' was built by hand outside any scene; pass the world`;
  let world: World;
  try {
    world = opts.world ?? (h.scene && scene ? scene.world(h.tuning) : game.world(h.mission, h.tuning));
  } catch (e) {
    return `its world can't be built: ${e instanceof Error ? e.message : String(e)}`;
  }
  if (game.fingerprint(world) !== h.worldFingerprint) return 'this build generates a different valley from the same mission';
  const sim = h.scene && scene ? startScene(scene, h.tuning, world) : game.simulation(world, h.tuning, opts.systems ?? game.systems);
  if (sim.hash() !== h.startHash) return 'this build starts the mission in a different state';
  return sim;
}

/**
 * Replays a recording's inputs through a fresh simulation, applying its tuning changes
 * on their ticks, and checks every checkpoint. A build that behaves differently is
 * caught before running (the versions, the scene, the valley's fingerprint, the first
 * state), and a divergence is reported with the parts of the state that differed.
 */
export function resimulate<S extends Simulation = Simulation>(rec: Recording, opts: ReplayOptions<S> = {}): ResimResult {
  const clock = opts.clock;
  const started = clock ? clock() : 0;
  const h = rec.header;
  const result = (fields: Partial<ResimResult>): ResimResult => ({
    ok: false,
    ticks: h.ticks,
    finalHash: '',
    expectedHash: h.finalHash,
    problem: null,
    firstDivergence: null,
    divergedParts: [],
    fault: null,
    ms: clock ? clock() - started : 0,
    ...fields,
  });

  const sim = replaySimulation(rec, opts);
  if (typeof sim === 'string') return result({ problem: sim });

  const changes = rec.tuningChanges();
  const checkpoints = rec.checkpoints();
  const input = neutralInput();
  let change = 0;
  let checkpoint = 0;
  let firstDivergence: number | null = null;
  let divergedParts: string[] = [];
  const describe = (f: { system: string; message: string }): string => `${f.system}: ${f.message}`;
  const expected = h.fault ? describe(h.fault) : null;
  for (let i = 0; i < h.ticks; i++) {
    while (change < changes.length && changes[change]!.tick === sim.tick + 1) sim.setTuning(changes[change++]!.tuning);
    rec.readInput(i, input);
    opts.watch?.before?.(sim);
    let events: readonly SimEvent[];
    try {
      events = sim.step(input);
    } catch {
      // A fault: the recorded one if this is its tick, otherwise a new one.
      const got = sim.fault ? describe(sim.fault) : 'an error outside the systems';
      const finalHash = hashOrZeros(sim);
      const same = expected !== null && sim.fault?.tick === h.fault!.tick && got === expected && finalHash === h.finalHash;
      return result({ ok: same && firstDivergence === null, ticks: i + 1, finalHash, firstDivergence, divergedParts, fault: { expected: expected ?? '(none)', got } });
    }
    opts.watch?.after?.(sim, events);
    const cp = checkpoints[checkpoint];
    if (cp && cp.tick === sim.tick) {
      if (firstDivergence === null && sim.hash() !== cp.hash) {
        firstDivergence = sim.tick;
        const recorded = new Map(cp.parts);
        divergedParts = stateParts(sim.state)
          .filter(([name, hash]) => recorded.get(name) !== hash)
          .map(([name]) => name);
        for (const [name] of cp.parts) if (!divergedParts.includes(name) && !stateParts(sim.state).some(([n]) => n === name)) divergedParts.push(name);
      }
      checkpoint++;
    }
  }
  const finalHash = sim.hash();
  if (expected !== null) return result({ finalHash, firstDivergence, divergedParts, fault: { expected, got: null } });
  return result({ ok: firstDivergence === null && finalHash === h.finalHash, finalHash, firstDivergence, divergedParts });
}
