import { generateWorld, type World } from '../gen/world';
import { neutralInput } from '../input';
import { Simulation } from '../sim';
import type { Recording } from './recording';
import { missionSpec } from '../mission';

export interface ResimResult {
  ok: boolean;
  ticks: number;
  finalHash: string;
  expectedHash: string;
  /** Tick of the first checkpoint that disagreed, if any. */
  firstDivergence: number | null;
  ms: number;
}

/**
 * Replays a recording's inputs through a fresh simulation and checks every checkpoint
 * hash. Pass a prebuilt world to skip generation, and a clock (milliseconds) to time it.
 */
export function resimulate(rec: Recording, world?: World, clock?: () => number): ResimResult {
  const started = clock ? clock() : 0;
  const { header } = rec;
  const w = world ?? generateWorld(missionSpec(header.seed, header.spawn), header.tuning);
  const sim = new Simulation(w, header.tuning);
  const input = neutralInput();
  let checkpoint = 0;
  let firstDivergence: number | null = null;
  for (let i = 0; i < header.ticks; i++) {
    rec.readInput(i, input);
    sim.step(input);
    if (sim.tick % header.checkpointEvery === 0) {
      if (firstDivergence === null && sim.hash() !== header.checkpoints[checkpoint]) firstDivergence = sim.tick;
      checkpoint++;
    }
  }
  const finalHash = sim.hash();
  return {
    ok: firstDivergence === null && finalHash === header.finalHash,
    ticks: header.ticks,
    finalHash,
    expectedHash: header.finalHash,
    firstDivergence,
    ms: clock ? clock() - started : 0,
  };
}
