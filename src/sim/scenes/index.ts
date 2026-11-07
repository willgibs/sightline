import type { Scene } from '../scene';
import { movementCourse } from './movementCourse';

/**
 * Every scene in this build, by name. A recording names its scene, and re-simulating it
 * needs the same scene in the same version (sim/scene.ts).
 */
export const SCENES: Readonly<Record<string, () => Scene>> = {
  'movement-course': movementCourse,
};

/** The scene a recording was made in, if this build has it. */
export function sceneOf(header: { scene: { name: string } | null }): Scene | undefined {
  const make = header.scene ? SCENES[header.scene.name] : undefined;
  return make?.();
}
