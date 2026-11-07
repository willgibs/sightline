import type { Tuning } from '../config/tuning';
import { pointAt } from '../sim/gen/paths';
import type { World } from '../sim/gen/world';
import { Blocks, type RayHit } from '../sim/world/colliders';
import type { AmbientSource, Muffle, MuffleFn } from './engine';

/**
 * Where a world's steady sounds are, and what muffles sound in it. Derived from the
 * generated world each time a valley is built; nothing here is simulation state.
 */

/** Creek emitters are spaced so their heard circles overlap into one continuous stream. */
const CREEK_SPACING = 26;

export function ambientSources(world: World, tuning: Tuning): AmbientSource[] {
  const out: AmbientSource[] = [];
  const creek = world.features.creek;
  for (let s = CREEK_SPACING / 2; s < creek.total; s += CREEK_SPACING) {
    const p = pointAt(creek, s);
    out.push({ kind: 'water', x: p.x, y: world.terrain.heightAt(p.x, p.z) + 0.2, z: p.z, radius: tuning.noise.ambient.creek });
  }
  for (const st of world.camp.structures) {
    if (st.kind !== 'generator') continue;
    const c = world.colliders.list[st.colliders[0]!]!;
    out.push({ kind: 'hum', x: c.x, y: (c.y0 + c.y1) / 2, z: c.z, radius: tuning.noise.ambient.generator });
  }
  return out;
}

const MUFFLED: Muffle = { gain: 0.45, cutoff: 900 };

/**
 * A first approximation of obstruction: the straight path is blocked by terrain or by
 * anything solid enough to stop a bullet. Phase 1 replaces this with sound that travels
 * around buildings along walkable paths (design doc · Enemy perception · Hearing).
 */
export function makeMuffle(world: World): MuffleFn {
  const hit: RayHit = { dist: 0, id: -1 };
  return (sx, sy, sz, lx, ly, lz) => {
    const dx = lx - sx;
    const dy = ly - sy;
    const dz = lz - sz;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 0.5) return null;
    const ux = dx / d;
    const uy = dy / d;
    const uz = dz / d;
    // Start a little above the source so a footstep isn't blocked by the ground it's on.
    const oy = sy + 0.3;
    const reach = d - 0.3;
    if (world.terrain.raycast(sx, oy, sz, ux, uy, uz, reach) < reach) return MUFFLED;
    world.colliders.raycast(sx, oy, sz, ux, uy, uz, reach, Blocks.Sound, hit);
    if (hit.id >= 0 && hit.dist < reach) return MUFFLED;
    return null;
  };
}
