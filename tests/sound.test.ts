import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { MUFFLED, makeMuffle } from '../src/audio/muffle';
import { MAX_LEAD, frameSpan, leadOf } from '../src/audio/engine';
import { FixedStepClock } from '../src/sim/kernel/core/clock';
import { Rng } from '../src/sim/kernel/core/rng';
import { neutralInput, quantizeInput } from '../src/sim/kernel/input';
import { gainOf } from '../src/app/sound';
import { Simulation } from '../src/sim/game/sim';
import { Faction } from '../src/sim/kernel/state';
import { generateWorld } from '../src/sim/generation/world';
import { missionSpec } from '../src/sim/kernel/mission';
import { CREEK_SPACING, ambientSources } from '../src/sim/generation/ambient';
import { Blocks, type Collider } from '../src/sim/kernel/world/colliders';
import type { QueryView } from '../src/sim/kernel/world/query';
import { Surface } from '../src/sim/kernel/world/surfaces';
import { EAST, testWorld, viewOf } from './fixtures';

/**
 * The game's sound, the parts that need no speakers: what muffles a sound on its way to
 * you, where the world's steady sounds are, and when a tick's sounds play against the
 * picture. The engine itself is measured in tests/browser/audio.test.ts.
 */

const wall = (flags: number): Collider => ({ kind: 'box', id: 0, x: 0, z: -5, y0: 0, y1: 3, hx: 3, hz: 0.1, ux: 1, uz: 0, flags, surface: Surface.Wood });

describe('muffling', () => {
  const ear = { x: 0, y: 1.6, z: 0 };
  const source = { x: 0, y: 0, z: -10 };
  const heard = (view: QueryView | null) => makeMuffle(() => view)(source.x, source.y, source.z, ear.x, ear.y, ear.z);

  it('is clear across open ground, and muffled behind a wall that stops sound', () => {
    expect(heard(viewOf(testWorld()))).toBeNull();
    expect(heard(viewOf(testWorld({ colliders: [wall(Blocks.All)] })))).toEqual(MUFFLED);
    // A fence that stops bodies but not sound lets it through.
    expect(heard(viewOf(testWorld({ colliders: [wall(Blocks.Move)] })))).toBeNull();
  });

  it("hears entities' solid shapes as it hears the world's colliders", () => {
    const sim = new Simulation(testWorld({ spawn: { x: 20, z: 20 } }), T);
    const view: QueryView = { world: sim.world, solids: sim.solids, bodies: [] };
    expect(heard(view)).toBeNull();
    // A gate swings shut between the source and the listener.
    sim.spawn((id) => ({ id, kind: 'solid', faction: Faction.None, solid: wall(Blocks.All) }));
    expect(heard(view)).toEqual(MUFFLED);
  });

  it('is muffled by a ridge in the way, but not by the ground under the source', () => {
    const ridge = testWorld({ cell: 0.5, height: (_x, z) => (Math.abs(z + 5) < 1 ? 3 : 0) });
    expect(heard(viewOf(ridge))).toEqual(MUFFLED);
    // A footstep on a slope: the straight path skims its own ground.
    const slope = testWorld({ height: (_x, z) => -z * 0.1 });
    const f = makeMuffle(() => viewOf(slope));
    expect(f(0, slope.terrain.heightAt(0, -10), -10, 0, 1.6, 0)).toBeNull();
  });

  it('is clear without a run to look through, and for a sound at the ear', () => {
    expect(heard(null)).toBeNull();
    const f = makeMuffle(() => viewOf(testWorld({ colliders: [wall(Blocks.All)] })));
    expect(f(0, 1.5, 0, 0, 1.6, 0)).toBeNull();
  });
});

describe("the world's steady sounds", () => {
  it('follow the creek in overlapping stretches, and hum at the generator', () => {
    const world = generateWorld(missionSpec('TAL-4471', 'overlook'), T);
    const sources = ambientSources(world, T);
    const water = sources.filter((s) => s.kind === 'water');
    expect(water.length).toBe(Math.ceil((world.features.creek.total - CREEK_SPACING / 2) / CREEK_SPACING));
    for (let k = 1; k < water.length; k++) {
      const d = Math.hypot(water[k]!.x - water[k - 1]!.x, water[k]!.z - water[k - 1]!.z);
      // Neighbours never further apart than the spacing (the creek bends), and always heard together.
      expect(d).toBeLessThanOrEqual(CREEK_SPACING + 1e-9);
      expect(d).toBeLessThan(2 * T.noise.ambient.creek);
    }
    for (const s of water) expect(s.y).toBeCloseTo(world.terrain.heightAt(s.x, s.z) + 0.2, 9);
    const generators = world.camp.structures.filter((st) => st.kind === 'generator').length;
    expect(sources.filter((s) => s.kind === 'hum')).toHaveLength(generators);
    expect(generators).toBeGreaterThan(0);
  });

  it('are none in a hand-built world without a creek or a generator', () => {
    expect(ambientSources(testWorld(), T)).toEqual([]);
  });
});

describe('sound timing', () => {
  const at = (shown: number, scale = 1, hold = 0) => ({ shown, scale, hold });

  it('holds a sound back until the picture shows its moment, and a frame more', () => {
    expect(leadOf(10.1, at(10))).toBeCloseTo(0.1, 12);
    expect(leadOf(10.1, at(10, 1, 0.016))).toBeCloseTo(0.116, 12);
    // Fast-forward: simulation time runs twice as fast as the clock on the wall.
    expect(leadOf(10.1, at(10, 2))).toBeCloseTo(0.05, 12);
    expect(leadOf(10.1, at(10, 0.25))).toBe(MAX_LEAD);
  });

  it('plays at once what the picture has already passed, or a nonsense time', () => {
    expect(leadOf(9.9, at(10))).toBe(0);
    expect(leadOf(9.99, at(10, 1, 0.016))).toBeCloseTo(0.006, 12);
    expect(leadOf(NaN, at(10))).toBe(0);
    expect(leadOf(10.1, at(NaN))).toBe(0);
    expect(leadOf(10.1, at(10, 0))).toBeCloseTo(0.1, 12);
    expect(leadOf(10.1, at(10, 1, NaN))).toBeCloseTo(0.1, 12);
  });

  it("keeps a sprint's rhythm at any frame rate, however uneven the frames", () => {
    // The game loop in miniature: frames of uneven length feed the clock, ticks run, and
    // each footstep is scheduled the way game.ts schedules it. Heard against the wall
    // clock, the steps keep the simulation's period to within a few milliseconds; played
    // when their tick happened to run, they would wander by most of a tick.
    const P = T.bodies.player;
    const period = P.stride.sprint / P.speed.sprint;
    for (const fps of [24, 30, 60, 75, 144]) {
      const sim = new Simulation(testWorld(), T);
      const clock = new FixedStepClock(T.sim.tickHz);
      const input = quantizeInput({ ...neutralInput(EAST), moveZ: 1, sprint: true });
      const jitter = new Rng('FRAMES', String(fps));
      let wall = 0;
      let span = 0;
      const timed: number[] = [];
      const naive: number[] = [];
      for (let f = 0; f < fps * 8; f++) {
        const dt = jitter.range(0.75, 1.25) / fps;
        wall += dt;
        span = frameSpan(span, dt);
        const ticks = clock.advance(dt);
        const timing = at((sim.tick + ticks - 1 + clock.alpha) / T.sim.tickHz, 1, Math.min(span, 0.05));
        for (let i = 0; i < ticks; i++) {
          for (const e of sim.step(input)) {
            if (e.type !== 'footstep' || e.t < 2) continue;
            timed.push(wall + leadOf(e.t, timing));
            naive.push(wall);
          }
        }
      }
      const worst = (xs: number[]) => Math.max(...xs.slice(1).map((x, k) => Math.abs(x - xs[k]! - period)));
      expect(timed.length).toBeGreaterThan(15);
      expect(worst(timed)).toBeLessThan(0.004);
      expect(worst(naive)).toBeGreaterThan(0.012);
    }
  });
});

describe('the volume setting', () => {
  it('is heard on a square law, within 0 to 1', () => {
    expect(gainOf(0)).toBe(0);
    expect(gainOf(0.5)).toBe(0.25);
    expect(gainOf(1)).toBe(1);
    expect(gainOf(2)).toBe(1);
    expect(gainOf(-1)).toBe(0);
  });
});
