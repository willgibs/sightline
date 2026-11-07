import { Solids } from '../src/sim/world/solids';
import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { air, defaultEnv, lightAt, sunDirection, timeOfDay, windAt, type EnvSpec } from '../src/sim/env';
import { Blocks } from '../src/sim/world/colliders';
import { Surface } from '../src/sim/world/surfaces';
import { testWorld } from './fixtures';

const v = { x: 0, y: 0, z: 0 };
const at = (env: Partial<EnvSpec>): EnvSpec => ({ ...defaultEnv(), ...env });

describe('the environment', () => {
  it('puts the default sun where the wireframe look was drawn: south-west, 35° up', () => {
    sunDirection(defaultEnv(), 0, v);
    expect(v.x).toBeCloseTo(-0.579, 2);
    expect(v.y).toBeCloseTo(0.574, 2);
    expect(v.z).toBeCloseTo(0.579, 2);
  });

  it('moves the sun along its day: east in the morning, highest at noon, west in the evening, below at night', () => {
    const elevation = (m: number) => sunDirection(at({ timeOfDayMin: m }), 0, v).y;
    expect(sunDirection(at({ timeOfDayMin: 9 * 60 }), 0, v).x).toBeGreaterThan(0);
    expect(sunDirection(at({ timeOfDayMin: 17 * 60 }), 0, v).x).toBeLessThan(0);
    expect(elevation(12 * 60)).toBeGreaterThan(elevation(11 * 60));
    expect(elevation(12 * 60)).toBeGreaterThan(elevation(13 * 60));
    expect(elevation(0)).toBeLessThan(0);
    // In the northern hemisphere the noon sun is in the south (+z).
    expect(sunDirection(at({ timeOfDayMin: 12 * 60 }), 0, v).z).toBeGreaterThan(0);
  });

  it('holds the light at clock rate 0 and runs the day at rate 1', () => {
    expect(timeOfDay(defaultEnv(), 3600)).toBe(defaultEnv().timeOfDayMin);
    expect(timeOfDay(at({ clockRate: 1 }), 3600)).toBeCloseTo(defaultEnv().timeOfDayMin + 60, 9);
    expect(timeOfDay(at({ timeOfDayMin: 1430, clockRate: 1 }), 1200)).toBeCloseTo(10, 9);
  });

  it('blows the wind toward the opposite of where it comes from', () => {
    const w = windAt(at({ wind: { speed: 4, fromDeg: 270 } }), 0, { x: 0, z: 0 });
    expect(w.x).toBeCloseTo(4, 9); // from the west, so toward the east
    expect(w.z).toBeCloseTo(0, 9);
  });

  it('thins the air with height and warms the speed of sound', () => {
    const sea = air(at({ altitudeM: 0, temperatureC: 15 }));
    expect(sea.density).toBeCloseTo(1.225, 3);
    expect(sea.speedOfSound).toBeCloseTo(340.3, 1);
    expect(air(at({ altitudeM: 8849, temperatureC: -30 })).density).toBeLessThan(0.55); // the top of Everest
  });

  it('lights a point in the sun, shades it behind a wall, and darkens it at night', () => {
    const wall = { kind: 'box' as const, x: -3, z: 3, y0: 0, y1: 6, hx: 0.5, hz: 6, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Wood };
    const w = testWorld({ colliders: [wall] });
    const L = T.visibility.light;
    expect(lightAt(w, new Solids(w.colliders), defaultEnv(), 0, 10, 1, -10, T.visibility)).toBe(L.lit);
    // The sun is in the south-west: a point just north-east of the wall is in its shade.
    expect(lightAt(w, new Solids(w.colliders), defaultEnv(), 0, -1.5, 1, 1.5, T.visibility)).toBe(L.shade);
    expect(lightAt(w, new Solids(w.colliders), at({ timeOfDayMin: 23 * 60 }), 0, 10, 1, -10, T.visibility)).toBe(L.dark);
  });
});
