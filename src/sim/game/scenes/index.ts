import type { Scene as KernelScene } from '../../kernel/scene';
import type { Simulation } from '../sim';
import { movementCourse } from './movementCourse';
import { perceptionLab } from './perceptionLab';
import { SIGHT_TABLE, sightScenario } from './sightScenario';
import { shootingRange } from './shootingRange';
import { spawnTick } from './spawnTick';

/** A scene of Sightline (kernel/scene.ts): its game is SIGHTLINE, and its runs are the game's simulations. */
export type Scene = KernelScene<Simulation>;

/**
 * Every scene in this build, by name, each made from its parameters ('' or none for most).
 * A recording names its scene and parameters, and re-simulating it needs the same scene in
 * the same version (kernel/scene.ts).
 */
export const SCENES: Readonly<Record<string, (params?: string) => Scene>> = {
  'movement-course': movementCourse,
  'perception-lab': perceptionLab,
  sight: sightScenario,
  'spawn-tick': spawnTick,
  'shooting-range': shootingRange,
};

/** The scene a recording was made in, with its parameters, if this build has it. */
export function sceneOf(header: { scene: { name: string; params: string } | null }): Scene | undefined {
  const make = header.scene ? SCENES[header.scene.name] : undefined;
  return make?.(header.scene!.params);
}

/**
 * The scenario tables (A3, the scenario runner): for a scene with parameters, the sets of
 * parameters it runs with in `npm run scene` and the tests, each with its expected outcome.
 * Labs C and E add theirs.
 */
export const SCENARIOS: Readonly<Record<string, readonly string[]>> = {
  sight: SIGHT_TABLE,
};
