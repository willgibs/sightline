import { beforeAll, describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { campMission, generateWorld } from '../src/sim/generation';
import { certify, clusters, killOrder, sightlines, takeApart, type PerchSight } from '../src/sim/generation/clusters';
import { buildTimeline, heatmaps, type Witnesses } from '../src/sim/generation/field';
import { findPerches, perchSeesDeck, perchViewshed } from '../src/sim/generation/perches';
import { buildRaster, cellOf, lineOfSight, type Raster } from '../src/sim/generation/raster';
import { Rng } from '../src/sim/kernel/core/rng';
import { Blocks, type RayHit } from '../src/sim/kernel/world/colliders';
import type { World } from '../src/sim/kernel/world/world';

/**
 * Lab D's analysis of a camp (D7, generation/campAnalysis.ts and its parts): its raster and
 * the perches' viewsheds held to exact raycasts, its clusters and their certification on
 * cases with known answers, its sight model held to the design doc's numbers, and the
 * analysis as a whole within its budgets.
 */

let world: World;
let raster: Raster;
beforeAll(() => {
  world = generateWorld(campMission('MUD-9031'), T);
  raster = buildRaster(world.camp, world.terrain, world.colliders, world.grid.site, T.gen.analysis.cell, T.gen.analysis.margin);
}, 120_000);

/** The exact answer: the heightfield's own raycast, then every collider that stops sight, then parked vehicles. */
function exactSight(w: World, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  const reach = len - 0.3;
  if (w.terrain.raycast(ax + ux * 0.3, ay + uy * 0.3, az + uz * 0.3, ux, uy, uz, reach - 0.3) < reach - 0.3) return false;
  const hit: RayHit = { dist: Infinity, id: -1 };
  w.colliders.raycast(ax + ux * 0.3, ay + uy * 0.3, az + uz * 0.3, ux, uy, uz, reach - 0.3, Blocks.Sight, hit);
  return hit.id < 0;
}

describe("the analysis raster's lines of sight", () => {
  it('agree with exact raycasts between points in the camp', () => {
    const r = new Rng('raster-check');
    let agree = 0;
    let looser = 0;
    let n = 0;
    const L = world.camp.layout!;
    for (let k = 0; k < 600; k++) {
      const pick = () => {
        const a = r.range(-L.halfA - 10, L.halfA + 10);
        const b = r.range(-L.halfB - 10, L.halfB + 10);
        return { x: world.camp.site.x + L.ux * a + L.vx * b, z: world.camp.site.z + L.uz * a + L.vz * b };
      };
      const p = pick();
      const q = pick();
      const py = world.terrain.heightAt(p.x, p.z) + 1.7;
      const qy = world.terrain.heightAt(q.x, q.z) + 1.05;
      const exact = exactSight(world, p.x, py, p.z, q.x, qy, q.z);
      const ours = lineOfSight(raster, p.x, py, p.z, q.x, qy, q.z);
      n++;
      if (exact === ours) agree++;
      else if (ours && !exact) looser++;
    }
    // Thin things fill a row of cells and wider ones the cells whose centres they cover, so
    // the raster differs from the world along their edges, a little either way.
    expect(agree / n).toBeGreaterThan(0.85);
    expect(looser / n).toBeLessThan(0.04);
  });
});

describe("a perch's viewshed", () => {
  it('agrees with exact raycasts from its eye to standing guards across the camp', () => {
    const perches = findPerches(world.terrain, world.camp.site, T.gen).slice(0, 8);
    expect(perches.length).toBeGreaterThan(4);
    let agree = 0;
    let n = 0;
    const r = new Rng('perch-check');
    const L = world.camp.layout!;
    for (const p of perches) {
      const view = perchViewshed(raster, world.terrain, p);
      for (let k = 0; k < 60; k++) {
        const a = r.range(-L.halfA, L.halfA);
        const b = r.range(-L.halfB, L.halfB);
        const x = world.camp.site.x + L.ux * a + L.vx * b;
        const z = world.camp.site.z + L.uz * a + L.vz * b;
        const chest = world.terrain.heightAt(x, z) + T.gen.sight.chest;
        const c = cellOf(raster, x, z);
        const ours = chest >= view[c]!;
        const exact = exactSight(world, p.x, p.eye, p.z, x, chest, z);
        n++;
        if (ours === exact) agree++;
      }
    }
    expect(agree / n).toBeGreaterThan(0.85);
  });
});

/** Witness edges from a rule: edge(a, b, k). */
function witnesses(guards: number, samples: number, edge: (a: number, b: number, k: number) => boolean): Witnesses {
  const e = new Uint8Array(samples * guards * guards);
  for (let k = 0; k < samples; k++) for (let a = 0; a < guards; a++) for (let b = 0; b < guards; b++) if (a !== b && edge(a, b, k)) e[(k * guards + a) * guards + b] = 1;
  return { guards, samples, edge: e };
}

/** One perch that sees each guard by a rule. */
function sight(guards: number, samples: number, seen: (g: number, k: number) => boolean): PerchSight {
  const s = new Uint8Array(guards * samples);
  for (let g = 0; g < guards; g++) for (let k = 0; k < samples; k++) if (seen(g, k)) s[g * samples + k] = 1;
  return { perches: 1, guards, samples, seen: s, distance: new Float32Array([0]) };
}

describe('a tower', () => {
  it('is open under its roof: its guard sees out, and perches see him', () => {
    const tower = world.camp.guards.find((g) => g.elevated)!;
    expect(tower).toBeDefined();
    const eye = tower.y + T.gen.sight.eye;
    // Straight out from the tower, every way round, the line clears his own tower's parapet and roof.
    let clear = 0;
    for (let k = 0; k < 16; k++) {
      const x = tower.x + Math.cos((k * Math.PI) / 8) * 25;
      const z = tower.z + Math.sin((k * Math.PI) / 8) * 25;
      if (lineOfSight(raster, tower.x, eye, tower.z, x, world.terrain.heightAt(x, z) + 1.05, z)) clear++;
    }
    expect(clear).toBeGreaterThan(8);
    // And some perch sees his chest over the parapet.
    const chest = tower.y + T.gen.sight.chest;
    expect(findPerches(world.terrain, world.camp.site, T.gen).some((p) => perchSeesDeck(raster, world.terrain, p, tower.x, chest, tower.z))).toBe(true);
  });
});

describe('clusters', () => {
  const duty = (W: Witnesses): Float32Array => {
    const d = new Float32Array(W.guards * W.guards);
    for (let k = 0; k < W.samples; k++) for (let p = 0; p < W.guards * W.guards; p++) d[p] = d[p]! + W.edge[k * W.guards * W.guards + p]! / W.samples;
    return d;
  };

  it('are the strongly connected parts of the sightline graph', () => {
    // 0 ↔ 1 watch each other; 2 watches 3 but not back; 4 is alone.
    const W = witnesses(5, 20, (a, b) => (a === 0 && b === 1) || (a === 1 && b === 0) || (a === 2 && b === 3));
    expect(clusters(W, duty(W), T.gen)).toEqual([[0, 1], [2], [3], [4]]);
  });

  it('are certified by a kill order: a chain inside the reaction window, a window, or neither', () => {
    const K = 40;
    // A pair who always watch each other, both in the perch's sight: a chain, two shots apart.
    const always = witnesses(2, K, () => true);
    const both = sight(2, K, () => true);
    expect(certify([0, 1], sightlines(always, both), T.gen).certified).toBe('chain');
    // The same pair, but the perch only ever sees one of them: the other always witnesses,
    // unless a distraction turns his eyes away for the shot.
    const one = sight(2, K, (g) => g === 0);
    expect(certify([0, 1], sightlines(always, one), T.gen).certified).toBe('distraction');
    // Three who all watch each other, and only one in sight: one distraction leaves a witness.
    const three = witnesses(3, K, () => true);
    const first = sight(3, K, (g) => g === 0);
    expect(certify([0, 1, 2], sightlines(three, first), T.gen).certified).toBe('unsolved');
    // A pair who watch each other only half the cycle: shoot in the other half.
    const half = witnesses(2, K, (_a, _b, k) => k < K / 2);
    expect(certify([0, 1], sightlines(half, both), T.gen).certified).toBe('window');
    // A pair who always watch each other but look away from one moment: wait for it.
    const glance = witnesses(2, K, (_a, _b, k) => k !== 30);
    expect(certify([0, 1], sightlines(glance, both), T.gen).kills[0]!.sample % K).toBe(30);
    // Nobody the perches can see: out of sight, for infiltration to deal with.
    const none = sight(2, K, () => false);
    expect(certify([0, 1], sightlines(always, none), T.gen).certified).toBe('out of sight');
  });
});

describe("the camp's kill order", () => {
  it('takes watchers first: a watched sentry falls after his watcher', () => {
    const K = 20;
    // 0 watches 1 all the time and nobody watches 0; the perch sees both.
    const W = witnesses(2, K, (a, b) => a === 0 && b === 1);
    const d = new Float32Array([0, 1, 0, 0]);
    const parts = clusters(W, d, T.gen);
    expect(parts).toEqual([[0], [1]]);
    expect(killOrder(parts, d, 2, T.gen)).toEqual([0, 1]);
    const all = sight(2, K, () => true);
    const taken = takeApart(W, d, sightlines(W, all), T.gen);
    expect(taken.map((c) => c.certified)).toEqual(['isolated', 'isolated']);
    // If the watcher can't be seen from the perches, his sentry needs a distraction...
    const hidden = sight(2, K, (g) => g === 1);
    expect(takeApart(W, d, sightlines(W, hidden), T.gen).map((c) => c.certified)).toEqual(['out of sight', 'distraction']);
    // ...and with two unseen watchers, one distraction isn't enough.
    const two = witnesses(3, K, (a, b) => a !== 1 && b === 1);
    const d3 = new Float32Array([0, 1, 0, 0, 0, 0, 0, 1, 0]);
    const one = sight(3, K, (g) => g === 1);
    expect(takeApart(two, d3, sightlines(two, one), T.gen).map((c) => c.certified)).toEqual(['out of sight', 'out of sight', 'unsolved']);
  });
});

describe('the analysis of a camp', () => {
  it('reports its heatmaps, perches, clusters and ways in and out, within its budgets', () => {
    const a = world.report.camp!;
    const f = a.frame;
    expect(a.coverage.length).toBe(f.na * f.nb);
    expect(a.samples).toBe(Math.round(a.cycle / a.dt));
    for (let c = 0; c < a.coverage.length; c++) {
      expect(a.coverage[c]).toBeGreaterThanOrEqual(0);
      expect(a.coverage[c]).toBeLessThanOrEqual(1);
      if (a.coverage[c] === 0) expect(a.idleness[c]).toBeCloseTo(a.cycle, 6);
      expect(a.idleness[c]).toBeLessThanOrEqual(a.cycle + 1e-6);
    }
    expect(a.perches.length).toBeGreaterThan(5);
    for (const p of a.perches) {
      expect(p.guards.length).toBe(world.camp.guards.length);
      expect(p.coverage).toBeCloseTo(p.guards.reduce((x, y) => x + y, 0) / p.guards.length, 9);
    }
    // Every guard belongs to exactly one cluster.
    expect(a.clusters.flatMap((c) => c.members).sort((x, y) => x - y)).toEqual(world.camp.guards.map((_, k) => k));
    for (const p of [a.infiltration, a.sabotage, a.exfil]) expect(p.expanded).toBeLessThanOrEqual(T.gen.analysis.maxExpansions);
    for (const c of a.clusters) expect(c.expanded).toBeLessThanOrEqual(T.gen.analysis.clusterExpansions + 1);
  });

  it('times the camp over one cycle that every routine divides', () => {
    const t = buildTimeline(world.camp, raster, T.gen);
    expect(t.samples * t.dt).toBeCloseTo(world.camp.cycle!, 9);
    const { coverage } = heatmaps({ samples: 4, cells: 1, rate: new Uint8Array([0, 3, 0, 0]) }, 0.5);
    expect(coverage[0]).toBe(0.25);
  });
});
