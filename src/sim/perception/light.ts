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

/** The area a world's shade is drawn over, and the size of its texels (the perception lab sets it). */
export interface ShadeArea {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  cell: number;
}

declare module '../kernel/world/world' {
  interface World {
    /** Where the ground's shade is drawn as the simulation finds it (A4); not drawn if absent. */
    shadeArea?: ShadeArea;
  }
}

/** The ground's light over an area: 1 where the sun reaches the ground, 0 in shade, at each texel's centre. */
export interface ShadeMap {
  x0: number;
  z0: number;
  cell: number;
  nx: number;
  nz: number;
  /** Row-major (z, then x): 255 lit, 0 shade. */
  lit: Uint8Array;
}

/**
 * The ground's shade over an area, from `groundLight` at each texel's centre (A4): what the
 * renderer draws, so the shade on screen is the shade a guard's eyes respect. Static: the
 * core mission's sun doesn't move (clockRate 0); Phase 3's dusk recomputes it.
 */
export function shadeMap(world: World, solids: Solids, env: EnvSpec, t: number, area: ShadeArea, tuning: Tuning): ShadeMap {
  const nx = Math.max(1, Math.round((area.x1 - area.x0) / area.cell));
  const nz = Math.max(1, Math.round((area.z1 - area.z0) / area.cell));
  const lit = new Uint8Array(nx * nz);
  const L = tuning.visibility.light;
  for (let j = 0; j < nz; j++) {
    const z = area.z0 + (j + 0.5) * area.cell;
    for (let i = 0; i < nx; i++) {
      const x = area.x0 + (i + 0.5) * area.cell;
      lit[j * nx + i] = groundLight(world, solids, env, t, x, world.terrain.heightAt(x, z), z, tuning) === L.lit ? 255 : 0;
    }
  }
  return { x0: area.x0, z0: area.z0, cell: area.cell, nx, nz, lit };
}

/**
 * Whether the drawn ground at (x, z) is lit, exactly as the terrain shader reads the map:
 * bilinear between texel centres (clamped at the edge), lit at half or more. Outside the
 * map, lit. The agreement test holds this to `groundLight` at sampled points.
 */
export function drawnLit(m: ShadeMap, x: number, z: number): boolean {
  const u = (x - m.x0) / m.cell - 0.5;
  const v = (z - m.z0) / m.cell - 0.5;
  if (u < -0.5 || v < -0.5 || u > m.nx - 0.5 || v > m.nz - 0.5) return true;
  const i0 = Math.min(m.nx - 1, Math.max(0, Math.floor(u)));
  const j0 = Math.min(m.nz - 1, Math.max(0, Math.floor(v)));
  const i1 = Math.min(m.nx - 1, i0 + 1);
  const j1 = Math.min(m.nz - 1, j0 + 1);
  const fu = Math.min(1, Math.max(0, u - i0));
  const fv = Math.min(1, Math.max(0, v - j0));
  const at = (i: number, j: number): number => m.lit[j * m.nx + i]! / 255;
  const top = at(i0, j0) + (at(i1, j0) - at(i0, j0)) * fu;
  const bottom = at(i0, j1) + (at(i1, j1) - at(i0, j1)) * fu;
  return top + (bottom - top) * fv >= 0.5;
}
