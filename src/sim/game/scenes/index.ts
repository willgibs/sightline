import type { Scene as KernelScene } from '../../kernel/scene';
import type { Simulation } from '../sim';
import { movementCourse } from './movementCourse';
import { spawnTick } from './spawnTick';

/** A scene of Sightline (kernel/scene.ts): its game is SIGHTLINE, and its runs are the game's simulations. */
export type Scene = KernelScene<Simulation>;

/**
 * Every scene in this build, by name. A recording names its scene, and re-simulating it
 * needs the same scene in the same version (kernel/scene.ts).
 */
export const SCENES: Readonly<Record<string, () => Scene>> = {
  'movement-course': movementCourse,
  'spawn-tick': spawnTick,
};

/** The scene a recording was made in, if this build has it. */
export function sceneOf(header: { scene: { name: string } | null }): Scene | undefined {
  const make = header.scene ? SCENES[header.scene.name] : undefined;
  return make?.();
}
