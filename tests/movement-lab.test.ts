import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { lightName } from '../src/sim/perception/light';
import { groundLight } from '../src/sim/perception/light';
import { SCENES } from '../src/sim/game/scenes';
import { ARENA, PLATFORM, WALLS, WINDOWS, arenaWorld } from '../src/sim/game/scenes/movementLab';
import type { Simulation } from '../src/sim/game/sim';
import { startScene } from '../src/sim/kernel/scene';
import { Blocks } from '../src/sim/kernel/world/colliders';
import { Surface, SURFACE_NAMES } from '../src/sim/kernel/world/surfaces';

/** The movement lab's ground rules (C1): every surface, lit and shaded ground, a guard who only hears. */
describe('the movement lab', () => {
  const sim = startScene(SCENES['movement-lab']!(), T) as Simulation;

  it('has a wedge of every surface around the listener', () => {
    const { terrain } = sim.world;
    const Y = ARENA.yard;
    const found = new Set<string>();
    for (let a = 0; a < 720; a++) {
      const r = (a * Math.PI) / 360;
      found.add(SURFACE_NAMES[terrain.surfaceAt(Y.x + 20 * Math.sin(r), Y.z - 20 * Math.cos(r))]!);
    }
    expect([...found].sort()).toEqual([...SURFACE_NAMES].sort());
  });

  const light = (x: number, z: number): string => lightName(groundLight(sim.world, sim.solids, sim.world.spec.env, 0, x, 0, z, T), T);

  it('has ground in the sun and ground in the shade', () => {
    const D = ARENA.divider;
    const R = ARENA.roof;
    expect(light(-20, D.z - 1)).toBe('shade'); // the divider's shadow, north of it
    expect(light(-20, D.z - 12)).toBe('lit'); // open field
    expect(light(R.x, R.z)).toBe('shade'); // under the roof
    expect(light(R.x + R.hx + 8, R.z)).toBe('lit');
  });

  it("stops the listener's eyes with canvas, and not his ears", () => {
    const tent = sim.world.camp.structures.find((s) => s.colliders.some((c) => sim.world.colliders.list[c]!.surface === Surface.Dirt));
    expect(tent).toBeDefined();
    for (const c of tent!.colliders) {
      const flags = sim.world.colliders.list[c]!.flags;
      expect(flags & Blocks.Sight).toBeTruthy();
      expect(flags & Blocks.Sound).toBe(0);
    }
  });

  it('has walls from a stride to out of reach, and windows you fit and do not', () => {
    expect(arenaWorld(T).colliders.list.length).toBe(sim.world.colliders.list.length);
    expect(WALLS.map((w) => w.height)).toEqual([0.6, 0.9, 1.2, 1.5, 1.9]);
    expect(WINDOWS.length).toBeGreaterThanOrEqual(3);
    expect(PLATFORM.height).toBeGreaterThan(T.bodies.player.stepHeight);
  });
});
