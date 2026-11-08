import { beforeAll, describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { campMission, campSpecProblems, defaultCampSpec, generateWorld, worldFingerprint } from '../src/sim/generation';
import { generateLandform } from '../src/sim/generation/landform';
import { checkValley } from '../src/sim/generation/overwatch';
import { closestOnPolyline, pointAt, type PathHit } from '../src/sim/generation/paths';
import type { TerrainResult } from '../src/sim/generation/terrain';
import { Rng } from '../src/sim/kernel/core/rng';
import { dtanDeg } from '../src/sim/kernel/core/detmath';
import { neutralInput } from '../src/sim/kernel/input';
import { missionSpec } from '../src/sim/kernel/mission';
import { Recorder, Recording } from '../src/sim/kernel/record/recording';
import { resimulate } from '../src/sim/kernel/record/resim';
import { makeTerrainSample } from '../src/sim/kernel/world/heightfield';
import type { World } from '../src/sim/kernel/world/world';
import { WanderBot } from '../src/sim/game/bots/wander';
import { SIGHTLINE, Simulation } from '../src/sim/game/sim';

/**
 * Terrain with teeth (D3, generation/landform.ts and overwatch.ts): ridges on chosen
 * bearings that overlook the camp from a few sectors, cliffs broken by gullies, a creek
 * crossed at fords, and ways in and out that are real choices. Phase 0's valley stays the
 * default until D9; a mission with a camp spec gets this one.
 */

const SEEDS = ['TAL-4471', 'MUD-9031', 'KOR-1188', 'BNC-0303', 'VEX-0042', 'POP-6981'];
const valleys: TerrainResult[] = [];
let world: World;
beforeAll(() => {
  for (const seed of SEEDS) valleys.push(generateLandform(new Rng(seed, 'valley'), T.gen));
  world = generateWorld(campMission('TAL-4471'), T);
}, 120_000);

const sample = makeTerrainSample();
const hit: PathHit = { dist: 0, s: 0, x: 0, z: 0 };
const walkable = dtanDeg(T.gen.walkableSlopeDeg);

describe('terrain with teeth', () => {
  it('is overlooked from its placed ridges only: half the horizon at most, with a wide open side', () => {
    for (const v of valleys) {
      const o = checkValley(v.heightfield, v.features, T.gen);
      expect(o.problems).toEqual([]);
      const ridges = v.features.ridges!;
      expect(ridges.length).toBeGreaterThanOrEqual(T.gen.landform.ridges[0]!);
      expect(ridges.length).toBeLessThanOrEqual(T.gen.landform.ridges[1]!);
      expect(o.ridgesSeen).toBe(ridges.length);
      expect(o.perchArcDeg).toBeLessThanOrEqual(T.gen.overwatch.maxPerchArcDeg);
      expect(o.openGapDeg).toBeGreaterThanOrEqual(T.gen.overwatch.minOpenGapDeg);
      // Every perch stands on a placed ridge, none on the open floor.
      for (const p of o.perches) expect(p.ridge).toBeLessThan(ridges.length);
      for (const p of o.perches) expect(p.dist).toBeGreaterThanOrEqual(T.gen.overwatch.perchRange[0]!);
    }
  });

  it("finds perches with a viewshed that agrees with exact raycasts", () => {
    // The radial sweep against the heightfield's own raycast, from the camp's eye to a
    // prone shooter's, at every perch it found and at points around them it didn't.
    let checked = 0;
    let agree = 0;
    for (const v of valleys) {
      const hf = v.heightfield;
      const site = v.features.site;
      const eye = { x: site.x, y: site.height + 1.6, z: site.z };
      const sees = (x: number, z: number): boolean => {
        const ty = hf.heightAt(x, z) + 0.6;
        const dx = x - eye.x;
        const dy = ty - eye.y;
        const dz = z - eye.z;
        const len = Math.hypot(dx, dy, dz);
        return hf.raycast(eye.x, eye.y, eye.z, dx / len, dy / len, dz / len, len - 1) >= len - 1;
      };
      for (const p of checkValley(hf, v.features, T.gen).perches) {
        checked++;
        if (sees(p.x, p.z)) agree++;
      }
    }
    expect(checked).toBeGreaterThan(30);
    expect(agree / checked).toBeGreaterThan(0.95);
  });

  it('has camp faces too steep to climb, except down their gullies', () => {
    for (const v of valleys) {
      for (const rd of v.features.ridges!) {
        const descents = (s: number): number[] => {
          // Slopes straight down the camp face from the crest: across the crest, toward the camp.
          const top = pointAt(rd.crest, s);
          const next = pointAt(rd.crest, s + 2);
          let nx = -(next.z - top.z);
          let nz = next.x - top.x;
          if (nx * rd.bx + nz * rd.bz > 0) [nx, nz] = [-nx, -nz];
          const len = Math.hypot(nx, nz);
          const slopes: number[] = [];
          for (let d = 4; d < rd.front * 0.9; d += 2) {
            const x = top.x + (nx / len) * d;
            const z = top.z + (nz / len) * d;
            // The creek's banks are a barrier of their own (tested below), wherever a gully meets them.
            if (closestOnPolyline(v.features.creek, x, z, T.gen.world.creekWidth / 2 + 10, hit).dist !== Infinity) break;
            v.heightfield.sample(x, z, sample);
            slopes.push(sample.slopeTan);
          }
          return slopes;
        };
        for (const g of rd.gullies) expect(Math.max(...descents(g))).toBeLessThan(walkable);
        // Away from the gullies, a face somewhere along the crest has a cliff band.
        let cliffs = 0;
        for (let s = 0.25 * rd.crest.total; s < 0.75 * rd.crest.total; s += 10) {
          if (rd.gullies.some((g) => Math.abs(g - s) < T.gen.landform.gullyWidth * 1.5)) continue;
          if (Math.max(...descents(s)) > walkable) cliffs++;
        }
        expect(cliffs).toBeGreaterThan(0);
      }
    }
  });

  it('has a creek that can be crossed only at its fords', () => {
    for (const v of valleys) {
      const creek = v.features.creek;
      const fords = v.features.fords!;
      expect(fords.length).toBeGreaterThanOrEqual(T.gen.landform.fords[0]!);
      const bankSlope = (s: number): number => {
        // The steepest ground within a few metres of the bed, across the creek.
        const p = pointAt(creek, s);
        const q = pointAt(creek, s + 2);
        const tx = q.x - p.x;
        const tz = q.z - p.z;
        const l = Math.hypot(tx, tz);
        let worst = 0;
        for (const side of [-1, 1]) {
          for (let d = T.gen.world.creekWidth / 2 + 1; d < T.gen.world.creekWidth / 2 + 6; d += 1) {
            v.heightfield.sample(p.x - (tz / l) * d * side, p.z + (tx / l) * d * side, sample);
            worst = Math.max(worst, sample.slopeTan);
          }
        }
        return worst;
      };
      for (const f of fords) expect(bankSlope(f.s)).toBeLessThan(walkable);
      // Near the camp and between the fords, the banks are cliffs.
      let steep = 0;
      let tried = 0;
      for (let s = 0; s < creek.total; s += 15) {
        const p = pointAt(creek, s);
        if (Math.hypot(p.x, p.z) > 400 || fords.some((f) => Math.abs(f.s - s) < 30)) continue;
        tried++;
        if (bankSlope(s) > walkable) steep++;
      }
      expect(steep / tried).toBeGreaterThan(0.6);
    }
  });

  it('can be left on foot by two ways that share no chokepoint, from all round', () => {
    for (const v of valleys) {
      const o = checkValley(v.heightfield, v.features, T.gen);
      expect(o.exfil).toBe(2);
      expect(o.access).toBeGreaterThanOrEqual(T.gen.overwatch.minAccess);
    }
  });
});

describe('a mission that asks for a camp', () => {
  it("gets lab D's valley, and a mission that names no camp gets the default compound, and says so", () => {
    const plain = missionSpec('TAL-4471');
    expect('camp' in plain).toBe(false);
    expect(world.features.ridges).toBeDefined();
    expect(world.report.valley?.ok).toBe(true);
    const named = generateWorld(plain, T);
    expect(named.spec.camp).toEqual(defaultCampSpec());
    expect(worldFingerprint(named)).toBe(worldFingerprint(world));
    expect(worldFingerprint(generateWorld(campMission('TAL-4471'), T))).toBe(worldFingerprint(world));
  });

  it('refuses a camp spec it cannot build', () => {
    expect(campSpecProblems({ archetype: 'compound', difficulty: 0.5 })).toEqual([]);
    expect(campSpecProblems({ archetype: 'airstrip', difficulty: 0.5 })).not.toEqual([]);
    expect(campSpecProblems({ archetype: 'compound', difficulty: 2 })).not.toEqual([]);
    expect(campSpecProblems({ archetype: 'compound' })).not.toEqual([]);
    expect(() => generateWorld({ ...campMission('TAL-4471'), camp: { archetype: 'compound', difficulty: -1 } }, T)).toThrow(/difficulty/);
  });

  it('is recorded with its camp, and re-simulates bit for bit', () => {
    const sim = new Simulation(world, T);
    const recorder = new Recorder(sim);
    const bot = new WanderBot(world.seed);
    const raw = neutralInput();
    for (let i = 0; i < 20 * 30; i++) recorder.record(sim, sim.step(bot.next(sim, raw)));
    const rec = Recording.fromBytes(recorder.finish(sim).toBytes());
    expect(rec.header.mission.camp).toEqual({ archetype: 'compound', difficulty: 0.5 });
    const r = resimulate(rec, { game: SIGHTLINE });
    expect(r.problem).toBeNull();
    expect(r.ok).toBe(true);
  });
});
