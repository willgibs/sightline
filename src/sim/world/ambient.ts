import type { Tuning } from '../../config/tuning';
import { pointAt } from '../gen/paths';
import type { World } from '../gen/world';

/**
 * The world's steady sounds: stretches of creek, the camp's generator. Derived from the
 * world each time it's built, never stored in the state.
 *
 * The list lives in the simulation, not the audio, so that one definition serves every
 * listener: the player's speakers play these sources, and lab A's hearing masks
 * footsteps with the same ones. Two lists would let the creek you hear drift from the
 * creek a guard hears.
 */

export type AmbientKind = 'water' | 'hum';

/** A fixed sound source in the world. */
export interface AmbientSource {
  kind: AmbientKind;
  x: number;
  y: number;
  z: number;
  /** Threshold radius, as for any sound (sim/sound.ts). */
  radius: number;
}

/** Creek emitters are spaced so their heard circles overlap into one continuous stream. */
export const CREEK_SPACING = 26;

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
