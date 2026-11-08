import { beforeAll, describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { analyzeCamp, buildRaster, campMission, campPlans, generateWorld, planOn, sameSignature, sharedFields, type AnalysisParts, type CampAnalysis, type Plan } from '../src/sim/generation';
import { sectorOf } from '../src/sim/generation/plans';
import type { World } from '../src/sim/kernel/world/world';

/**
 * The exit test's restricted-play bots (generation/plans.ts): their signatures use the closed
 * vocabulary, two plans are the same when three of the four fields match, and a camp's own
 * best plan works on that camp.
 */

const G = T.gen;
let world: World;
let analysis: CampAnalysis;
let parts: AnalysisParts;
let plans: Plan[];
let best: Plan;

beforeAll(() => {
  world = generateWorld(campMission('BNC-0101'), T);
  const R = buildRaster(world.camp, world.terrain, world.colliders, world.grid.site, G.analysis.cell, G.analysis.margin);
  ({ analysis, parts } = analyzeCamp(world.camp, world.terrain, world.colliders, world.grid, G, R));
  ({ plans, best } = campPlans(world.camp, analysis, parts, G));
}, 120_000);

describe('signatures', () => {
  it('match on three of four fields, and no fewer', () => {
    const a = { opening: 'back near', first: 'sentry@left', split: 'window', tool: 'rifle window' } as const;
    expect(sharedFields(a, a)).toBe(4);
    expect(sameSignature(a, { ...a, split: 'chain' })).toBe(true);
    expect(sameSignature(a, { ...a, split: 'chain', first: 'worker@left' })).toBe(false);
  });

  it('name the eight sectors round the camp, the gate at the front', () => {
    const L = world.camp.layout!;
    const at = (f: number, r: number): [number, number] => [world.camp.site.x + L.ux * f + L.vx * r, world.camp.site.z + L.uz * f + L.vz * r];
    expect(sectorOf(world.camp, ...at(100, 0))).toBe('front');
    expect(sectorOf(world.camp, ...at(-100, 0))).toBe('back');
    expect(sectorOf(world.camp, ...at(0, 100))).toBe('right');
    expect(sectorOf(world.camp, ...at(0, -100))).toBe('left');
    expect(sectorOf(world.camp, ...at(100, 100))).toBe('front-right');
    expect(sectorOf(world.camp, ...at(-100, -100))).toBe('back-left');
  });
});

describe('the bots', () => {
  it('give a plan for each approach, in the vocabulary, and the best is one that reaches the target', () => {
    expect(plans.map((p) => p.approach)).toEqual(['long range', 'infiltration', 'systems']);
    for (const p of plans) {
      expect(p.signature.opening.length).toBeGreaterThan(0);
      expect(p.risk).toBeGreaterThanOrEqual(0);
      expect(p.risk).toBeLessThanOrEqual(1);
    }
    expect(best.seconds).toBeLessThan(Infinity);
  });

  it("carry a camp's own best plan out on that camp", () => {
    expect(planOn(best.signature, world.camp, analysis, parts, G)).toBeLessThan(1);
  });
});
