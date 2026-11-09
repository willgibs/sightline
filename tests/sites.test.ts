import { beforeAll, describe, expect, it } from 'vitest';
import { defaultTuning as T, type Tuning } from '../src/config/tuning';
import { EXPERIMENTS } from '../src/lab/experiments';
import { describe as describeCamp, plainTuning } from '../src/lab/experiments/variety';
import { campMission, generateWorld, siteKindOf, SITE_KINDS, type SiteKind } from '../src/sim/generation';
import { cruxOf } from '../src/sim/generation/crux';
import { generateLandform } from '../src/sim/generation/landform';
import { checkValley } from '../src/sim/generation/overwatch';
import { pickWeighted } from '../src/sim/generation/weights';
import type { TerrainResult } from '../src/sim/generation/terrain';
import { Rng } from '../src/sim/kernel/core/rng';
import { dtanDeg } from '../src/sim/kernel/core/detmath';
import { acousticsOf, emptyHeard } from '../src/sim/perception';
import { Cell, cellIndex } from '../src/sim/kernel/world/grid';
import { GridSearch } from '../src/sim/kernel/world/search';
import { makeTerrainSample } from '../src/sim/kernel/world/heightfield';

/**
 * The kinds of site and camp a seed can be (landform.ts, compound.ts, staffing.ts): each is
 * what it says, each passes the checks every camp must, and old seeds of the valley kind
 * keep their heights, since every new kind draws only from new streams (rule 3).
 */

/** A valley of one kind: the seed's own, with the other kinds' weights set to nothing. The compound stays the plain yard, whatever the type weights say. */
function only(kind: SiteKind): Tuning {
  const t = structuredClone(T);
  for (const k of SITE_KINDS) t.gen.landform.sites[k] = k === kind ? 1 : 0;
  for (const type of ['keep', 'depot', 'farm'] as const) for (const c of ['walk', 'inside', 'flush', 'escort'] as const) t.gen.compound.types[type].cruxes[c] = 0;
  return t;
}

const SEEDS = ['KIND-0001', 'KIND-0002', 'KIND-0003'];

describe('the kinds of site', () => {
  const valleys = new Map<SiteKind, TerrainResult[]>();
  beforeAll(() => {
    for (const kind of SITE_KINDS) valleys.set(kind, SEEDS.map((s) => generateLandform(new Rng(s, 'valley'), only(kind).gen)));
  }, 120_000);

  const eachOf = (kind: SiteKind): TerrainResult[] => valleys.get(kind)!;

  it('picks a kind from a stream of its own, so re-rolling a valley keeps it', () => {
    for (const seed of SEEDS) expect(generateLandform(new Rng(seed, 'valley#3'), T.gen).features.kind).toBe(siteKindOf(seed, T.gen));
    expect(SITE_KINDS.every((k) => T.gen.landform.sites[k] > 0)).toBe(true);
  });

  it('passes the checks a valley must, whatever its kind', () => {
    for (const kind of SITE_KINDS) {
      for (const v of eachOf(kind)) {
        expect(v.features.kind).toBe(kind);
        const o = checkValley(v.heightfield, v.features, T.gen);
        expect(o.problems, `${kind}: ${o.problems.join('; ')}`).toEqual([]);
      }
    }
  });

  it('a spur: the ground falls away round the pad, except along its neck', () => {
    for (const v of eachOf('spur')) {
      const hf = v.heightfield;
      const pad = v.features.site.height;
      let fallen = 0;
      for (let k = 0; k < 72; k++) {
        const a = (k * Math.PI) / 36;
        if (hf.heightAt(Math.cos(a) * 220, Math.sin(a) * 220) <= pad - 12) fallen++;
      }
      expect(fallen / 72).toBeGreaterThan(0.6);
      // The ridges overlook it from across the low ground, no higher than the kind says.
      for (const r of v.features.ridges!) expect(r.height).toBeLessThanOrEqual(T.gen.landform.spur.drop[1]! + T.gen.landform.spur.ridgeRise[1]! + 1);
    }
  });

  it('a bend: the river loops behind the camp, and is crossed at fords', () => {
    for (const v of eachOf('bend')) {
      expect(v.features.creekWidth!).toBeGreaterThanOrEqual(T.gen.landform.bend.width[0]!);
      const near = v.features.creek.points.filter((p) => Math.hypot(p.x, p.z) < 200);
      const bearings = near.map((p) => Math.atan2(p.z, p.x)).sort((a, b) => a - b);
      let widest = 2 * Math.PI + bearings[0]! - bearings[bearings.length - 1]!;
      for (let k = 1; k < bearings.length; k++) widest = Math.max(widest, bearings[k]! - bearings[k - 1]!);
      // Within 200 m, the water covers at least a quarter of the horizon round the camp.
      expect((2 * Math.PI - widest) / (2 * Math.PI)).toBeGreaterThan(0.25);
      expect(v.features.fords!.length).toBeGreaterThanOrEqual(T.gen.landform.bend.fords[0]!);
    }
  });

  it('a scarp or a gorge has walls nobody can stand on, except at a notch', () => {
    const sample = makeTerrainSample();
    const steep = dtanDeg(T.gen.walkableSlopeDeg);
    for (const kind of ['scarp', 'gorge'] as const) {
      for (const v of eachOf(kind)) {
        const walls = v.features.ridges!.filter((r) => r.wall);
        expect(walls.length).toBe(kind === 'scarp' ? 1 : 2);
        const o = checkValley(v.heightfield, v.features, T.gen);
        // Nothing on a wall is called a perch.
        for (const p of o.perches) expect(v.features.ridges![p.ridge]!.wall).toBe(false);
        for (const w of walls) {
          let cliff = 0;
          let n = 0;
          for (let s = 0.2 * w.crest.total; s < 0.8 * w.crest.total; s += 8) {
            if (w.gullies.some((g) => Math.abs(g - s) < T.gen.landform.gullyWidth * 1.5)) continue;
            // Half way down the face.
            const k = Math.min(w.crest.points.length - 1, Math.floor((s / w.crest.total) * (w.crest.points.length - 1)));
            const c = w.crest.points[k]!;
            const l = Math.hypot(c.x, c.z);
            const x = c.x - (c.x / l) * w.front * 0.5;
            const z = c.z - (c.z / l) * w.front * 0.5;
            v.heightfield.sample(x, z, sample);
            n++;
            if (sample.slopeTan > steep) cliff++;
          }
          expect(cliff / n).toBeGreaterThan(0.6);
        }
      }
    }
  });

  it('a col: high shoulders close on either side', () => {
    for (const v of eachOf('col')) {
      const spines = v.features.ridges!.filter((r) => !r.wall);
      expect(spines.length).toBe(2);
      const distances = spines.map((r) => Math.hypot(r.crest.points[Math.floor(r.crest.points.length / 2)]!.x, r.crest.points[Math.floor(r.crest.points.length / 2)]!.z));
      for (const d of distances) expect(d).toBeLessThan(T.gen.landform.col.shoulderDistance[1]! + 30);
      const [a, b] = spines;
      expect(a!.bx * b!.bx + a!.bz * b!.bz).toBeLessThan(-0.5);
    }
  });
});

describe('camps of every kind', () => {
  // Fixed seeds and forced plans: each combination is built and held to validation and to
  // what's special about it. Ways in, out and to the generator are validation's.
  const cases: Array<{ seed: string; kind: SiteKind; plot: 'yard' | 'long' | 'wide' | 'tight'; perimeter: 'chain' | 'screen' | 'fort'; fill: 'open' | 'packed' }> = [
    { seed: 'PLAN-0001', kind: 'hollow', plot: 'long', perimeter: 'fort', fill: 'packed' },
    { seed: 'PLAN-0002', kind: 'spur', plot: 'wide', perimeter: 'screen', fill: 'open' },
    { seed: 'PLAN-0003', kind: 'bend', plot: 'tight', perimeter: 'chain', fill: 'packed' },
    { seed: 'PLAN-0004', kind: 'scarp', plot: 'wide', perimeter: 'fort', fill: 'open' },
    { seed: 'PLAN-0005', kind: 'gorge', plot: 'long', perimeter: 'screen', fill: 'packed' },
    { seed: 'PLAN-0006', kind: 'col', plot: 'yard', perimeter: 'chain', fill: 'open' },
  ];
  const tuned = (c: (typeof cases)[number]): Tuning => {
    const t = only(c.kind);
    const yard = t.gen.compound.types.yard;
    for (const k of ['yard', 'long', 'wide', 'tight'] as const) yard.plots[k] = k === c.plot ? 1 : 0;
    for (const k of ['chain', 'screen', 'fort', 'fields'] as const) yard.perimeters[k] = k === c.perimeter ? 1 : 0;
    for (const k of ['open', 'packed'] as const) yard.fills[k] = k === c.fill ? 1 : 0;
    return t;
  };

  for (const c of cases) {
    it(`${c.kind}, ${c.plot} plot, ${c.perimeter} perimeter, ${c.fill} yard: stands, and is what it says`, () => {
      const t = tuned(c);
      const w = generateWorld(campMission(c.seed), t);
      expect(w.features.kind).toBe(c.kind);
      const L = w.camp.layout!;
      expect(L.plan).toEqual({ plot: c.plot, perimeter: c.perimeter, fill: c.fill });
      expect(w.report.validation!.failed).toEqual([]);
      const aspect = L.halfA / L.halfB;
      if (c.plot === 'long') expect(aspect).toBeGreaterThan(1.5);
      if (c.plot === 'wide') expect(aspect).toBeLessThan(1 / 1.5);
      if (c.plot === 'tight') expect(Math.max(L.halfA, L.halfB)).toBeLessThanOrEqual(t.gen.compound.plotTight[1]!);
      // A perimeter wall has many pieces; the screen inside a buried target's door has one or two.
      const solid = w.camp.structures.filter((s) => s.kind === 'block' && s.colliders.length > 2).length;
      if (c.perimeter === 'fort') expect(w.camp.structures.some((s) => s.kind === 'fence')).toBe(false);
      if (c.perimeter !== 'chain') expect(solid).toBeGreaterThan(0);
      if (c.perimeter === 'chain') expect(solid).toBe(0);
      if (c.fill === 'packed') expect(w.camp.structures.filter((s) => s.kind === 'container').length).toBeGreaterThan(8);
      // Everyone can be got to, in every kind of camp: a walk from the camp reaches the edge of the play area.
      const map = w.grid.map;
      const search = new GridSearch(map);
      search.flood([cellIndex(map, w.camp.site.x, w.camp.site.z)], { maxExpansions: map.nx * map.nz });
      let edge = 0;
      for (let c2 = 0; c2 < map.flags.length; c2++) {
        const x = map.x0 + ((c2 % map.nx) + 0.5) * map.cell;
        const z = map.z0 + (Math.floor(c2 / map.nx) + 0.5) * map.cell;
        if ((map.flags[c2]! & Cell.Walkable) && search.cost[c2]! >= 0 && Math.max(Math.abs(x), Math.abs(z)) > w.playHalf - 5 && Math.max(Math.abs(x), Math.abs(z)) <= w.playHalf) edge++;
      }
      expect(edge).toBeGreaterThan(50);
    }, 180_000);
  }
});

describe('the crux a camp is built around', () => {
  const forced = (crux: 'inside' | 'flush' | 'escort'): Tuning => {
    const t = structuredClone(T);
    t.gen.crux.kinds = { walk: 0, inside: 0, flush: 0, escort: 0, [crux]: 1 };
    return t;
  };
  const SEEDS_ = ['CRUX-0001', 'CRUX-0002', 'CRUX-0003'];
  const worlds = new Map<string, ReturnType<typeof generateWorld>>();
  beforeAll(() => {
    for (const crux of ['inside', 'flush', 'escort'] as const) for (const seed of SEEDS_) worlds.set(`${crux}${seed}`, generateWorld(campMission(seed), forced(crux)));
    // Nine camps, three of them flush camps at their slowest: more than three minutes on a loaded Windows runner.
  }, 420_000);
  const each = (crux: string): ReadonlyArray<ReturnType<typeof generateWorld>> => SEEDS_.map((s) => worlds.get(`${crux}${s}`)!);

  it('is picked from a stream of its own, and every kind comes up', () => {
    const seen = new Set(Array.from({ length: 60 }, (_, k) => cruxOf(`SEED-${k}`, T.gen)));
    expect(seen.has('inside') && seen.has('flush') && seen.has('escort')).toBe(true);
    expect(seen.has('walk')).toBe(false);
  });

  it('buries the target: inside and flush keep him indoors, out of every perch\'s view', () => {
    for (const crux of ['inside', 'flush'] as const) {
      for (const w of each(crux)) {
        expect(w.camp.crux).toBe(crux);
        expect(w.report.validation!.failed).toEqual([]);
        const a = w.report.camp!;
        for (const p of a.perches) expect(p.target * a.cycle).toBeLessThanOrEqual(T.gen.crux.buriedSeconds + 1e-6);
        // He's in his building all cycle: no perch-free walk.
        const t = w.camp.guards[w.camp.objective!.target]!;
        expect(t.route).toBeNull();
      }
    }
  });

  it('where the crux is the way in, a way in exists; where it is not, his one door is held', () => {
    for (const w of each('inside')) {
      expect(w.report.camp!.infiltration.found).toBe(true);
      const hq = w.camp.layout!.buildings.find((b) => b.module === 'hq')!;
      expect(hq.doors.length).toBe(2);
      // Two doors are two ways in: one on each of two walls, each with a way round its screen.
      const [a, b] = hq.doors.map((i) => w.camp.doors![i]!);
      expect(a!.nx * b!.nx + a!.nz * b!.nz).toBeLessThan(0.5);
    }
    for (const crux of ['flush', 'escort'] as const) {
      for (const w of each(crux)) {
        const hq = w.camp.layout!.buildings.find((b) => b.module === 'hq')!;
        expect(hq.doors.length).toBe(1);
        const door = w.camp.doors![hq.doors[0]!]!;
        expect(w.camp.guards.some((g) => g.role === 'sentry' && Math.hypot(g.x - door.x, g.z - door.z) < 2.6)).toBe(true);
      }
    }
  });

  it('a flush target hears the siren from every box, however deep he stays', () => {
    // Behind the deep room's walls and the screen inside his door, a siren that lost what a voice loses was silent, and he never ran.
    for (const w of each('flush')) {
      const him = w.camp.guards[w.camp.objective!.target]!;
      const acoustics = acousticsOf(w, T);
      const y = w.terrain.heightAt(him.x, him.z) + T.bodies.guard.eyeHeight.stand;
      const boxes = (w.camp.devices ?? []).filter((d) => d.kind === 'alarm');
      expect(boxes.length).toBeGreaterThan(0);
      for (const b of boxes) {
        const heard = emptyHeard();
        acoustics.spread({ x: b.x, y: w.terrain.heightAt(b.x, b.z) + T.brain.alarm.sirenHeight, z: b.z, radius: T.brain.alarm.sirenRadius, wallLossDb: T.perception.hearing.sirenWallLossDb });
        acoustics.hear(him.x, y, him.z, heard);
        expect(heard.clarity).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('starts the player on ground with a way to the camp', () => {
    // One of the camps that started him on a shelf he could slide off and never get back to.
    const w = generateWorld(campMission('REV-0010'), T);
    const walk = new GridSearch(w.grid.map);
    walk.flood([cellIndex(w.grid.map, w.camp.site.x, w.camp.site.z)], { maxExpansions: w.grid.map.nx * w.grid.map.nz });
    expect(walk.cost[cellIndex(w.grid.map, w.spawn.x, w.spawn.z)]!).toBeGreaterThanOrEqual(0);
  }, 120_000);

  it('a flush camp can stop him when he runs; an escort camp has a perch that can have him', () => {
    for (const w of each('flush')) {
      const a = w.report.camp!;
      expect(a.perches.some((p) => p.run >= T.gen.validation.interceptSeconds) || a.vehicle.found).toBe(true);
    }
    for (const w of each('escort')) {
      const a = w.report.camp!;
      expect(a.perches.some((p) => p.target * a.cycle >= T.gen.validation.targetSeconds)).toBe(true);
      expect(w.report.validation!.failed).not.toContain('crux');
    }
  });
});

describe('picking by weight', () => {
  const keys = ['a', 'b', 'c'] as const;
  it('picks only what has weight, and the same for the same stream', () => {
    for (let k = 0; k < 40; k++) expect(pickWeighted(new Rng(`w${k}`), { a: 0, b: 1, c: 0 }, keys)).toBe('b');
    const picks = (seed: string) => Array.from({ length: 12 }, (_, k) => pickWeighted(new Rng(`${seed}${k}`), { a: 1, b: 2, c: 3 }, keys));
    expect(picks('x')).toEqual(picks('x'));
    expect(new Set(picks('y')).size).toBeGreaterThan(1);
  });
  it('falls back to the first key when nothing has weight', () => {
    expect(pickWeighted(new Rng('z'), { a: 0, b: 0, c: 0 }, keys)).toBe('a');
  });
});

describe('the variety experiments', () => {
  it('are on the bench, by the names their commands take', () => {
    for (const name of ['variety-ground', 'variety-perches', 'variety-views', 'variety-compound', 'variety-target', 'variety-families', 'variety-cruxes']) expect(EXPERIMENTS[name]?.name).toBe(name);
  });

  it('measure a camp from its own site, and tell a plain camp from one with its variety on', () => {
    const plain = plainTuning(T);
    const seed = 'KIND-0002';
    const a = describeCamp(generateWorld(campMission(seed), plain), plain);
    expect(a.kind).toBe('hollow');
    expect(a.plot).toBe('yard');
    expect(a.perimeter).toBe('chain');
    expect(a.crux).toBe('walk');
    for (const key of ['prominence', 'skyline', 'walled', 'perchAngle', 'groundMedian', 'targetShare', 'blocked'] as const) expect(Number.isFinite(a[key])).toBe(true);
    expect(a.perchNear).toBeGreaterThanOrEqual(T.gen.overwatch.perchRange[0]!);
    for (const r of Object.values(a.risks)) {
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
    const spur = only('spur');
    expect(describeCamp(generateWorld(campMission(seed), spur), spur).kind).toBe('spur');
  }, 60_000);
});
