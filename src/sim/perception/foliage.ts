import { indexedFoliage, type Foliage, type FoliageVolume } from '../kernel/world/foliage';
import type { World } from '../kernel/world/world';

/**
 * The foliage that dims sight: bushes and canopies a scene hands over as volumes (the law
 * is the kernel's, kernel/world/foliage.ts). The renderer draws the same volumes by the
 * same law (render/foliageMeshes.ts), so what you see through a bush is what a guard sees
 * through it. A generated valley's bushes are still opaque sight colliders, and its trees
 * have crowns of their own (World.crowns), which also stop a line.
 */

export { coneChord, cylinderChord, Foliage, type FoliageVolume } from '../kernel/world/foliage';

declare module '../kernel/world/world' {
  interface World {
    /**
     * Foliage that dims sight, as plain data so the world's fingerprint covers it; none
     * if absent. `foliageOf` gives it indexed.
     */
    foliage?: readonly FoliageVolume[];
  }
}

/** A world's foliage, indexed: built the first time it's asked for. None if the world has none. */
export function foliageOf(world: World): Foliage {
  return indexedFoliage(world.foliage);
}
