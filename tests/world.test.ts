import { beforeAll, describe, expect, it } from 'vitest';
import { defaultTuning } from '../src/config/tuning';
import { closestOnPolyline, type PathHit } from '../src/sim/gen/paths';
import { generateWorld, worldFingerprint, type World } from '../src/sim/gen/world';
import { makeTerrainSample } from '../src/sim/world/heightfield';
import { missionSpec } from '../src/sim/mission';

const fingerprint = worldFingerprint;

let tal: World;
beforeAll(() => {
  tal = generateWorld(missionSpec('TAL-4471'), defaultTuning);
});

describe('world generation', () => {
  it('validates walkability with the controller\'s own slope limit', () => {
    expect(defaultTuning.gen.walkableSlopeDeg).toBe(defaultTuning.player.maxSlopeDeg);
  });

  it('builds the same valley from the same seed', () => {
    const again = generateWorld(missionSpec('TAL-4471'), defaultTuning);
    expect(fingerprint(again)).toBe(fingerprint(tal));
  });

  it('builds different valleys from different seeds', () => {
    const other = generateWorld(missionSpec('KOR-1188'), defaultTuning);
    expect(fingerprint(other)).not.toBe(fingerprint(tal));
  });

  it('depends on tuning.gen and nothing else', () => {
    // Every non-integer number outside gen moves by 1%; integers there are rates and
    // counts with their own rules, and generation has no business reading them either.
    const nudged = structuredClone(defaultTuning) as unknown as Record<string, unknown>;
    let moved = 0;
    const nudge = (v: unknown): unknown => {
      if (typeof v === 'number') {
        if (Number.isInteger(v)) return v;
        moved++;
        return v * 1.01;
      }
      if (Array.isArray(v)) return v.map(nudge);
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, nudge(x)]));
      return v;
    };
    for (const key of Object.keys(nudged)) if (key !== 'gen') nudged[key] = nudge(nudged[key]);
    expect(moved).toBeGreaterThan(40);
    const world = generateWorld(missionSpec('TAL-4471'), nudged as unknown as typeof defaultTuning);
    expect(fingerprint(world)).toBe(fingerprint(tal));
    // And the check isn't vacuous: a gen value does change the valley.
    const gen = structuredClone(defaultTuning);
    gen.gen.world.hills *= 1.01;
    expect(fingerprint(generateWorld(missionSpec('TAL-4471'), gen))).not.toBe(fingerprint(tal));
  });

  it('keeps old seeds stable', () => {
    // Daily contracts and shared seeds depend on a seed always building the same valley.
    // If you change generation on purpose, update this value and note it in docs/decisions.md.
    expect(fingerprint(tal)).toBe(GOLDEN_TAL_4471);
  });

  it('flattens the camp pad', () => {
    const { terrain } = tal;
    const pad = defaultTuning.gen.world.padRadius;
    for (let r = 0; r < pad; r += 7) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * 2 * Math.PI;
        expect(terrain.heightAt(Math.cos(a) * r, Math.sin(a) * r)).toBeCloseTo(defaultTuning.gen.world.padHeight, 5);
      }
    }
  });

  it('passes validation with overwatch and access from several directions', () => {
    expect(tal.report.ok).toBe(true);
    expect(tal.report.overwatchSectors).toBeGreaterThanOrEqual(3);
    expect(tal.report.accessSectors).toBeGreaterThanOrEqual(4);
    for (const p of tal.report.perches) {
      expect(p.heightAbovePad).toBeGreaterThanOrEqual(12);
      expect(p.dist).toBeGreaterThanOrEqual(150);
      expect(p.dist).toBeLessThanOrEqual(500);
    }
  });

  it('spawns the player on walkable ground inside the play area, facing the camp', () => {
    const { spawn, terrain, playHalf } = tal;
    expect(Math.abs(spawn.x)).toBeLessThan(playHalf);
    expect(Math.abs(spawn.z)).toBeLessThan(playHalf);
    const s = terrain.sample(spawn.x, spawn.z, makeTerrainSample());
    expect(s.slopeTan).toBeLessThan(Math.tan((30 * Math.PI) / 180));
    const toCamp = -(spawn.x * spawn.faceX + spawn.z * spawn.faceZ) / Math.hypot(spawn.x, spawn.z);
    expect(toCamp).toBeCloseTo(1, 6);
  });

  it('puts guards on the ground or on their towers', () => {
    for (const g of tal.camp.guards) {
      const ground = tal.terrain.heightAt(g.x, g.z);
      if (g.elevated) expect(g.y).toBeGreaterThan(ground + 5);
      else expect(g.y).toBeCloseTo(ground, 5);
    }
    expect(tal.camp.guards.length).toBeGreaterThanOrEqual(6);
    expect(tal.camp.guards.length).toBeLessThanOrEqual(16);
  });

  it('keeps cover off the pad, the road and the creek bed', () => {
    const W = defaultTuning.gen.world;
    const hit: PathHit = { dist: 0, s: 0, x: 0, z: 0 };
    for (const p of [...tal.props.trees, ...tal.props.bushes, ...tal.props.rocks]) {
      expect(Math.hypot(p.x, p.z)).toBeGreaterThan(W.padRadius);
      expect(closestOnPolyline(tal.features.road, p.x, p.z, W.roadWidth / 2, hit).dist).toBe(Infinity);
      expect(closestOnPolyline(tal.features.creek, p.x, p.z, W.creekWidth / 2, hit).dist).toBe(Infinity);
    }
    expect(tal.props.trees.length).toBeGreaterThan(2000);
    expect(tal.props.bushes.length).toBeGreaterThan(500);
  });
});

const GOLDEN_TAL_4471 = 'e18ab41cbe67c919';
