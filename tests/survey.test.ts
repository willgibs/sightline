import { describe, expect, it } from 'vitest';
import { defaultTuning } from '../src/config/tuning';
import { generateWorld, surveyWorld } from '../src/sim/generation';
import { missionSpec } from '../src/sim/kernel/mission';

/**
 * The survey (generation/survey.ts): what the seed explorer draws and the seed report
 * reads, for each generated world. It must be plain data a worker can post, and say what
 * the world says.
 */
describe('a survey of a generated world', () => {
  const world = generateWorld(missionSpec('TAL-4471'), defaultTuning);
  const s = surveyWorld(world, 64);

  it('is plain data a worker can post, and small', () => {
    expect(structuredClone(s)).toEqual(s);
    expect(JSON.stringify({ ...s, terrain: null }).length).toBeLessThan(200_000);
  });

  it('says what the world says: its validation, guards, structures and perches', () => {
    expect(s.seed).toBe('TAL-4471');
    expect(s.ok).toBe(world.report.ok);
    expect(s.attempt).toBe(world.attempt);
    expect(s.guards.map((g) => g.role)).toEqual(world.camp.guards.map((g) => g.role));
    expect(s.structures.length).toBe(world.camp.structures.length);
    expect(s.structures.reduce((n, st) => n + st.shapes.length, 0)).toBe(world.camp.structures.reduce((n, st) => n + st.colliders.length, 0));
    expect(s.perches.length).toBe(world.report.perches.length);
  });

  it('samples the terrain above the pad, row by row', () => {
    const { n, size, heights } = s.terrain;
    expect(heights.length).toBe(n * n);
    const i = 40;
    const j = 21;
    const x = -size / 2 + ((i + 0.5) * size) / n;
    const z = -size / 2 + ((j + 0.5) * size) / n;
    expect(heights[j * n + i]).toBeCloseTo(world.terrain.heightAt(x, z) - world.camp.site.height, 4);
    // The pad is flat at the camp's centre.
    const c = Math.floor(n / 2);
    expect(Math.abs(heights[c * n + c]!)).toBeLessThan(0.01);
  });
});
