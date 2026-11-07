import type { Tuning } from '../../config/tuning';

/** What the ground is made of. Drives footstep loudness now, and later sound and tints. */
export const Surface = {
  Grass: 0,
  Dirt: 1,
  Gravel: 2,
  Rock: 3,
  Water: 4,
  Metal: 5,
  Wood: 6,
} as const;

export type Surface = (typeof Surface)[keyof typeof Surface];

export const SURFACE_NAMES = ['grass', 'dirt', 'gravel', 'rock', 'water', 'metal', 'wood'] as const;
export type SurfaceName = (typeof SURFACE_NAMES)[number];

export function surfaceName(s: Surface): SurfaceName {
  return SURFACE_NAMES[s];
}

export function surfaceLoudness(s: Surface, tuning: Tuning): number {
  return tuning.noise.surface[SURFACE_NAMES[s]];
}
