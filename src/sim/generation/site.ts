/**
 * Where a camp stands: its centre, the direction its gate faces, and the pad it is built
 * on. A camp is laid out in its site's frame (camp.ts), and everything that looks for the
 * camp asks its site: validation's perches and approaches, the player's spawn, the first
 * view, the debug view. Nothing assumes a camp at the origin, so a valley could hold
 * several, and a camp could stand on terrain that came from elsewhere.
 *
 * The procedural valley is shaped around one site at the origin (terrain.ts).
 */
export interface Site {
  /** The centre of the camp. */
  x: number;
  z: number;
  /** Unit vector toward the gate: the camp's first axis. */
  ux: number;
  uz: number;
  /** The flattened pad: its radius and its height. */
  radius: number;
  height: number;
}

/** A site with no pad: for worlds built by hand. */
export function siteAt(x: number, z: number, ux = 1, uz = 0): Site {
  return { x, z, ux, uz, radius: 0, height: 0 };
}
