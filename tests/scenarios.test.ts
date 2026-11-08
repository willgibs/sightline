import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { Recording } from '../src/sim/kernel/record/recording';
import { resimulate } from '../src/sim/kernel/record/resim';
import { runScene } from '../src/sim/kernel/scene';
import { SCENES, sceneOf } from '../src/sim/game/scenes';
import { SIGHT_TABLE, formatSight, parseSight, sightScenario } from '../src/sim/game/scenes/sightScenario';
import { SEED_LAW, SIGHT_LAW, sweepSight } from '../src/sim/perception';

/**
 * The scenario runner (A3): a scenario is a scene with parameters and an expected range.
 * Its first table is the design doc's sight ranges, run whole; the factor-grid sweep runs
 * the rate law over every combination. The targets are the plan's (A · recorded before
 * building), and the seed's numbers are what they improve on.
 */
describe('the sight scenarios', () => {
  for (const params of SIGHT_TABLE) {
    it(params, () => {
      const run = runScene(sightScenario(params), T);
      expect(run.failures).toEqual([]);
    });
  }

  it('name their parameters in their recordings, and re-simulate through them', () => {
    const params = SIGHT_TABLE[5]!;
    const scene = sightScenario(params);
    const run = runScene(scene, T);
    const rec = Recording.fromBytes(run.recording.toBytes());
    expect(rec.header.scene).toEqual({ name: 'sight', version: scene.version, params: formatSight(parseSight(params)) });
    const again = sceneOf(rec.header)!;
    expect(again.params).toBe(scene.params);
    expect(resimulate(rec, { scene: again }).ok).toBe(true);
    // The same scene with other parameters is another scene: refused, with the reason.
    expect(resimulate(rec, { scene: SCENES.sight!('d=31') }).problem).toMatch(/with parameters/);
  });

  it('refuse parameters they do not know', () => {
    expect(() => sightScenario('d=31&colour=red')).toThrow(/no parameter 'colour'/);
    expect(() => sightScenario('stance=lying')).toThrow(/stance must be/);
    expect(() => sightScenario('d=-4')).toThrow(/d must be a number/);
  });
});

describe('the factor-grid sweep', () => {
  const ours = sweepSight(T, SIGHT_LAW);
  const seed = sweepSight(T, SEED_LAW);

  it('meets the design doc ranges', () => {
    expect(Math.abs(ours.standingReach - 150)).toBeLessThanOrEqual(10);
    expect(ours.proneCoverReach).toBeLessThanOrEqual(50);
    expect(ours.crouchShade30).toBeGreaterThanOrEqual(3);
    expect(ours.crouchShade30).toBeLessThanOrEqual(6);
    expect(Math.abs(ours.farReach - 400)).toBeLessThanOrEqual(20);
  });

  it('never fills slower with more exposure, anywhere on the grid', () => {
    expect(ours.pairs).toBeGreaterThan(2_000_000);
    expect(ours.examples).toEqual([]);
    expect(ours.violations).toBe(0);
  });

  it('telegraphs: outside contact, the first cue comes at least 1.5 s before 100%', () => {
    expect(ours.minCueSeconds).toBeGreaterThanOrEqual(T.perception.sight.minCueSeconds - 1e-12);
  });

  it('ramps every edge: no rate jumps more than its share over a metre or a degree', () => {
    // The fastest rate is the telegraph's cap; the narrowest range edge is 2 m, a cone's 4°.
    const cap = (1 - T.perception.sight.cue) / T.perception.sight.minCueSeconds;
    expect(ours.steepestMetre).toBeLessThanOrEqual(cap / T.perception.sight.edgeMin + 1e-9);
    expect(ours.steepestDegree).toBeLessThanOrEqual(cap / T.perception.sight.edgeDeg + 1e-9);
  });

  it('shows where the seed falls short on the same grid', () => {
    expect(seed.proneCoverReach).toBeGreaterThan(50);
    expect(seed.crouchShade30).toBeGreaterThan(6);
    expect(seed.minCueSeconds).toBeLessThan(T.perception.sight.minCueSeconds);
  });
});
