import type { Tuning } from '../config/tuning';
import { worldTuningKey } from '../sim/generation';
import type { World } from '../sim/kernel/world/world';

/**
 * The world an experiment last built, kept for its next run (src/lab/experiment.ts).
 *
 * An experiment runs the same camps several ways, and building a camp costs far more than
 * playing it for a few minutes: seconds against a fraction of one. A world is only read once
 * it's built (the simulation's state is elsewhere, rule 9), and it depends on nothing but
 * its mission and the tuning's generation half, so the arms of an experiment, and the rolls
 * of its dice, can share one. The runner hands a process all of a camp's runs together
 * (src/headless/experiment.ts), so keeping just the last world is enough, and memory stays
 * at one world a process.
 *
 * `name` says which world: whatever, with the generation tuning, decides it (a camp scene's
 * seed and difficulty). A run that needs its scene to build the world itself, because the
 * scene keeps something from the building, doesn't use this.
 */
let last: { key: string; world: World } | null = null;

export function keptWorld(name: string, tuning: Tuning, build: (tuning: Tuning) => World): World {
  const key = `${name}|${worldTuningKey(tuning)}`;
  if (last?.key !== key) last = { key, world: build(tuning) };
  return last.world;
}
