import type { MissionSpec } from '../mission';
import type { ColliderSet } from './colliders';
import type { FoliageVolume } from './foliage';
import type { SpatialGrid } from './grid';
import type { Heightfield } from './heightfield';

/**
 * A mission's static world as the kernel knows it: the terrain, the colliders, the
 * spatial grid, and what it was built from. Whatever builds worlds adds its own parts to
 * this interface by module augmentation; the generation lane adds the camp, the props,
 * the analysis report and the spawn (generation/world.ts). The kernel names none of
 * them, and reads only the fields declared here: `npm run typecheck` compiles the kernel
 * on its own (tsconfig.kernel.json), where no lane's additions exist, to hold it to that.
 */
export interface World {
  /** What this world was built from: recordings store it, and re-simulating builds the world again from it. */
  spec: MissionSpec;
  seed: string;
  terrain: Heightfield;
  colliders: ColliderSet;
  /** Walking, sound, shelter and cover, cell by cell (grid.ts). */
  grid: SpatialGrid;
  /** Half-size of the playable square; beyond it is out of bounds. */
  playHalf: number;
  /** Tree crowns (foliage.ts), as plain data so the world's fingerprint covers them; none if absent. */
  crowns?: readonly FoliageVolume[];
  /** How much crown (density × length) a line of sight or a bullet gets through before it's stopped. */
  crownStop?: number;
}
