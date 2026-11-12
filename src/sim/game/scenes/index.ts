import type { Scene as KernelScene } from '../../kernel/scene';
import type { Simulation } from '../sim';
import { ladderTower } from './ladderTower';
import { campBrain } from './campBrain';
import { compound } from './compound';
import { firefight } from './firefight';
import { outTheGate } from './outTheGate';
import { hunt } from './hunt';
import { CAMP_SCENARIOS, campScenario } from './campScenario';
import { campSystems } from './campSystems';
import { liveCamp } from './liveCamp';
import { ladder } from './ladder';
import { OVERLOOK_TABLE, overlook } from './overlook';
import { movementCourse } from './movementCourse';
import { movementLab } from './movementLab';
import { perceptionCrowd, perceptionLab } from './perceptionLab';
import { NOISE_TABLE, noiseScenario } from './noiseScenario';
import { SIGHT_TABLE, sightScenario } from './sightScenario';
import { shootingRange } from './shootingRange';
import { spawnTick } from './spawnTick';
import { takedown } from './takedown';

/** A scene of Sightline (kernel/scene.ts): its game is SIGHTLINE, and its runs are the game's simulations. */
export type Scene = KernelScene<Simulation>;

/**
 * Every scene in this build, by name, each made from its parameters ('' or none for most).
 * A recording names its scene and parameters, and re-simulating it needs the same scene in
 * the same version (kernel/scene.ts).
 */
export const SCENES: Readonly<Record<string, (params?: string) => Scene>> = {
  'ladder-tower': ladderTower,
  'camp-brain': campBrain,
  compound,
  'camp-scenario': campScenario,
  'movement-course': movementCourse,
  'movement-lab': movementLab,
  'perception-crowd': perceptionCrowd,
  'perception-lab': perceptionLab,
  noise: noiseScenario,
  sight: sightScenario,
  'spawn-tick': spawnTick,
  'camp-systems': campSystems,
  'live-camp': liveCamp,
  firefight,
  'out-the-gate': outTheGate,
  hunt,
  overlook,
  ladder,
  'shooting-range': shootingRange,
  takedown,
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
  noise: NOISE_TABLE,
  sight: SIGHT_TABLE,
  'camp-scenario': CAMP_SCENARIOS,
  overlook: OVERLOOK_TABLE,
};
