import type { Tuning } from '../../config/tuning';
import { DEG, datan2, dcos, dpow, dsin } from './core/detmath';
import type { World } from './world/world';
import { Blocks } from './world/colliders';
import type { Solids } from './world/solids';

/**
 * The mission's environment, owned by the simulation: the time of day and the sun, the
 * wind, and the air. Set by the mission spec; a pure function of mission time, so the
 * renderer draws the sun the simulation lights with, and glint, shade and a skyline
 * read the same sun.
 *
 * The core mission runs in steady daylight (clockRate 0) with a steady wind; Phase 3
 * adds dawn, dusk, night and gusts.
 */

export interface EnvSpec {
  /** Local solar time at the start, in minutes after midnight. */
  timeOfDayMin: number;
  /** Mission seconds per second of the day: 0 holds the light, 1 runs it in real time. */
  clockRate: number;
  /** Where on Earth, and when in the year: they decide the sun's path. */
  latitudeDeg: number;
  dayOfYear: number;
  /** Steady wind: m/s, and the compass direction it blows from. */
  wind: { speed: number; fromDeg: number };
  /** Height above sea level and air temperature: they decide the air's density and the speed of sound. */
  altitudeM: number;
  temperatureC: number;
}

/** A mid-October afternoon at 33° N: the sun stands in the south-west, 35° up. */
export function defaultEnv(): EnvSpec {
  return { timeOfDayMin: 864, clockRate: 0, latitudeDeg: 33, dayOfYear: 289, wind: { speed: 3, fromDeg: 250 }, altitudeM: 1400, temperatureC: 20 };
}

/** The time of day in minutes at mission time `t` (seconds). */
export function timeOfDay(env: EnvSpec, t: number): number {
  const m = env.timeOfDayMin + (env.clockRate * t) / 60;
  return m - Math.floor(m / 1440) * 1440;
}

/** Unit vector toward the sun (y up; north is −z, east +x). Below the horizon, y < 0. */
export function sunDirection(env: EnvSpec, t: number, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const phi = env.latitudeDeg * DEG;
  const decl = -23.44 * DEG * dcos(((2 * Math.PI) / 365) * (env.dayOfYear + 10));
  const hour = ((timeOfDay(env, t) / 60 - 12) * 15) * DEG;
  const sinEl = dsin(phi) * dsin(decl) + dcos(phi) * dcos(decl) * dcos(hour);
  const cosEl = Math.sqrt(Math.max(0, 1 - sinEl * sinEl));
  // Azimuth from north, clockwise.
  const az = datan2(dsin(hour), dcos(hour) * dsin(phi) - (dsin(decl) / dcos(decl)) * dcos(phi)) + Math.PI;
  out.x = cosEl * dsin(az);
  out.y = sinEl;
  out.z = -cosEl * dcos(az);
  return out;
}

/** The wind's velocity (where the air goes), m/s. Steady until Phase 3's gusts. */
export function windAt(env: EnvSpec, _t: number, out: { x: number; z: number }): { x: number; z: number } {
  const to = (env.wind.fromDeg + 180) * DEG;
  out.x = env.wind.speed * dsin(to);
  out.z = -env.wind.speed * dcos(to);
  return out;
}

/** The air: density (kg/m³, for drag) and the speed of sound (m/s). */
export function air(env: EnvSpec): { density: number; speedOfSound: number } {
  const kelvin = env.temperatureC + 273.15;
  const pressure = 101325 * dpow(1 - 2.25577e-5 * env.altitudeM, 5.25588);
  return { density: pressure / (287.05 * kelvin), speedOfSound: 331.3 * Math.sqrt(kelvin / 273.15) };
}

const sun = { x: 0, y: 0, z: 0 };

/**
 * The light at a point, as the sight table's factor: full sun, shade (the sun hidden by
 * terrain or anything that blocks sight), dusk or dark (by the sun's height).
 */
export function lightAt(world: World, solids: Solids, env: EnvSpec, t: number, x: number, y: number, z: number, V: Tuning['visibility']): number {
  sunDirection(env, t, sun);
  const elevation = datan2(sun.y, Math.sqrt(sun.x * sun.x + sun.z * sun.z));
  if (elevation < -6 * DEG) return V.light.dark;
  if (elevation < 6 * DEG) return V.light.dusk;
  const reach = 3000;
  if (world.terrain.raycast(x, y, z, sun.x, sun.y, sun.z, reach) < reach) return V.light.shade;
  if (solids.raycast(x, y, z, sun.x, sun.y, sun.z, reach, Blocks.Sight, shadeHit).id >= 0) return V.light.shade;
  return V.light.lit;
}

const shadeHit = { dist: Infinity, id: -1 };
