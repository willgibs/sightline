import type { Tuning } from '../../config/tuning';
import { lightAt, sunDirection, type EnvSpec } from '../kernel/env';
import type { Solids } from '../kernel/world/solids';
import type { World } from '../kernel/world/world';
import { foliageOf } from './foliage';

/**
 * How lit a body is, for sight: the light at the ground beneath it (owner, Nov 7), which
 * is the light the player can see there. The environment's light at that point (sun,
 * shade, dusk or dark: kernel/env.ts), with foliage between it and the sun casting shade
 * where it lets less than `shadeBelow` of the sun through.
 *
 * The renderer draws the ground's shade from this same function (render/shadeMap.ts), so
 * the shade you see is the shade a guard's eyes respect.
 */

const sun = { x: 0, y: 0, z: 0 };

/** The light factor at the ground at (x, z), whose height is `groundY` (feet, for a body). */
export function groundLight(world: World, solids: Solids, env: EnvSpec, t: number, x: number, groundY: number, z: number, tuning: Tuning): number {
  const V = tuning.visibility;
  const S = tuning.perception.sight;
  const y = groundY + S.groundLift;
  const light = lightAt(world, solids, env, t, x, y, z, V);
  if (light !== V.light.lit) return light;
  const foliage = foliageOf(world);
  if (foliage.volumes.length === 0 || y >= foliage.top) return light;
  sunDirection(env, t, sun);
  // As far up the sun's line as the tallest foliage.
  const reach = (foliage.top - y) / Math.max(sun.y, 1e-6) + 1;
  const through = foliage.transmittance(x, y, z, x + sun.x * reach, y + sun.y * reach, z + sun.z * reach);
  return through < S.shadeBelow ? V.light.shade : light;
}

/** The name of a light factor, for the debug view and explanations. */
export function lightName(light: number, tuning: Tuning): 'lit' | 'shade' | 'dusk' | 'dark' {
  const L = tuning.visibility.light;
  return light === L.lit ? 'lit' : light === L.shade ? 'shade' : light === L.dusk ? 'dusk' : 'dark';
}
