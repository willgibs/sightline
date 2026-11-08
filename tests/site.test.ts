import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { Rng } from '../src/sim/kernel/core/rng';
import { buildTestCamp, type Camp } from '../src/sim/generation/camp';
import type { Site } from '../src/sim/generation/site';
import type { TerrainFeatures } from '../src/sim/generation/terrain';
import { ColliderSet } from '../src/sim/kernel/world/colliders';
import { testWorld } from './fixtures';

/**
 * Camps stand at sites (generation/site.ts): the same camp at another site is the same camp,
 * moved. Nothing in it assumes it stands at the origin.
 */
describe('a camp at a site', () => {
  function campAt(site: Site): { camp: Camp; colliders: ColliderSet } {
    const hf = testWorld({ size: 1200, cell: 4 }).terrain; // flat, so the ground doesn't differ between sites
    const colliders = new ColliderSet(1200);
    const features = { site } as TerrainFeatures;
    const camp = buildTestCamp(new Rng('SITE-0001', 'camp'), hf, features, colliders, T.gen, new Rng('SITE-0001', 'routines'));
    colliders.build();
    return { camp, colliders };
  }

  it('is the same camp moved, wherever the site is', () => {
    const axis = { ux: 0.8, uz: 0.6 };
    const home = campAt({ x: 0, z: 0, ...axis, radius: 78, height: 0.5 });
    const away = campAt({ x: 310.5, z: -220.25, ...axis, radius: 78, height: 0.5 });
    const dx = 310.5;
    const dz = -220.25;
    expect(away.colliders.list.length).toBe(home.colliders.list.length);
    home.colliders.list.forEach((c, k) => {
      const d = away.colliders.list[k]!;
      expect(d.x - c.x).toBeCloseTo(dx, 9);
      expect(d.z - c.z).toBeCloseTo(dz, 9);
      expect({ ...d, x: 0, z: 0 }).toEqual({ ...c, x: 0, z: 0 }); // sizes, heights, axes, flags, surfaces
    });
    home.camp.guards.forEach((g, k) => {
      const h = away.camp.guards[k]!;
      expect(h.x - g.x).toBeCloseTo(dx, 9);
      expect(h.z - g.z).toBeCloseTo(dz, 9);
      expect([h.faceX, h.faceZ]).toEqual([g.faceX, g.faceZ]);
      // Routines move with it: every hold is where it was, plus the offset.
      g.routine.legs.forEach((leg, i) => {
        const other = h.routine.legs[i]!;
        // Times come from distances, which a translation changes in the last bit or so.
        expect(other.t0).toBeCloseTo(leg.t0, 9);
        expect(other.t1).toBeCloseTo(leg.t1, 9);
        if (leg.kind === 'hold' && other.kind === 'hold') {
          expect(other.x - leg.x).toBeCloseTo(dx, 9);
          expect(other.z - leg.z).toBeCloseTo(dz, 9);
        }
      });
    });
    expect(away.camp.site.x).toBe(310.5);
  });
});
