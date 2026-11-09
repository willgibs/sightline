import type { ColliderSet } from '../kernel/world/colliders';
import type { Camp } from './camp';

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

/**
 * Where a walk from the camp starts: its site's centre, or, where a building stands there (a
 * keep), just inside its gate. The walk is on a layer that can't see into a building.
 */
export function campWalkStart(camp: Camp): { x: number; z: number } {
  const L = camp.layout;
  const { site } = camp;
  if (L) {
    for (const b of L.buildings) {
      const dx = site.x - b.x;
      const dz = site.z - b.z;
      if (Math.abs(dx * b.ux + dz * b.uz) <= b.length / 2 && Math.abs(-dx * b.uz + dz * b.ux) <= b.depth / 2) {
        const gate = L.openings.find((o) => o.kind === 'gate')!;
        return { x: site.x + L.ux * (gate.a - 3) + L.vx * gate.b, z: site.z + L.uz * (gate.a - 3) + L.vz * gate.b };
      }
    }
  }
  return { x: site.x, z: site.z };
}

/** The area the fine grid covers: every camp structure's footprint and a margin. Nothing assumes where the camp is. */
export function siteBounds(camp: Camp, colliders: ColliderSet, margin: number): { minX: number; minZ: number; maxX: number; maxZ: number } {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const st of camp.structures) {
    for (const id of st.colliders) {
      const c = colliders.list[id]!;
      const e = c.kind === 'cyl' ? c.r : Math.abs(c.ux) * c.hx + Math.abs(c.uz) * c.hz + Math.abs(c.uz) * c.hx + Math.abs(c.ux) * c.hz;
      minX = Math.min(minX, c.x - e);
      maxX = Math.max(maxX, c.x + e);
      minZ = Math.min(minZ, c.z - e);
      maxZ = Math.max(maxZ, c.z + e);
    }
  }
  if (minX > maxX) return { minX: -margin, minZ: -margin, maxX: margin, maxZ: margin };
  return { minX: minX - margin, minZ: minZ - margin, maxX: maxX + margin, maxZ: maxZ + margin };
}
