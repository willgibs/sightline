import { generateWorld, worldFingerprint, type World } from '../gen/world';
import { neutralInput } from '../input';
import { Simulation } from '../sim';
import { STATE_SCHEMA, stateParts } from '../state';
import { GEN_VERSION, SIM_VERSION } from '../version';
import type { Recording } from './recording';

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
  ms: number;
}

/**
 * Replays a recording's inputs through a fresh simulation, applying its tuning changes
 * on their ticks, and checks every checkpoint. A build that behaves differently is
 * caught before running (the versions, the valley's fingerprint, the first state), and a
 * divergence is reported with the parts of the state that differed. Pass a prebuilt
 * world to skip generation, and a clock (milliseconds) to time it.
 */
export function resimulate(rec: Recording, world?: World, clock?: () => number): ResimResult {
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
    ms: clock ? clock() - started : 0,
    ...fields,
  });

  if (h.simVersion !== SIM_VERSION || h.stateSchema !== STATE_SCHEMA || h.genVersion !== GEN_VERSION) {
    return result({
      problem:
        `made by a build with simulation ${h.simVersion}, state ${h.stateSchema}, generation ${h.genVersion}; ` +
        `this build has ${SIM_VERSION}, ${STATE_SCHEMA}, ${GEN_VERSION}${h.build ? ` (it was ${h.build})` : ''}`,
    });
  }
  const w = world ?? generateWorld(h.mission, h.tuning);
  if (worldFingerprint(w) !== h.worldFingerprint) return result({ problem: 'this build generates a different valley from the same mission' });
  const sim = new Simulation(w, h.tuning);
  if (sim.hash() !== h.startHash) return result({ problem: 'this build starts the mission in a different state' });

  const changes = rec.tuningChanges();
  const checkpoints = rec.checkpoints();
  const input = neutralInput();
  let change = 0;
  let checkpoint = 0;
  let firstDivergence: number | null = null;
  let divergedParts: string[] = [];
  for (let i = 0; i < h.ticks; i++) {
    while (change < changes.length && changes[change]!.tick === sim.tick + 1) sim.setTuning(changes[change++]!.tuning);
    rec.readInput(i, input);
    sim.step(input);
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
  return result({ ok: firstDivergence === null && finalHash === h.finalHash, finalHash, firstDivergence, divergedParts });
}
