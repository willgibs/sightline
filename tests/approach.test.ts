import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { approachOf, emptyWay, eyesOn, navigatorOf } from '../src/sim/brain';
import { Cell, cellIndex } from '../src/sim/kernel/world/grid';
import type { World } from '../src/sim/kernel/world/world';
import { worldOf } from './live';

/**
 * The valley as a section reads it (brain/approach.ts): which ground a firing point can
 * see, read off a raster with no rays, and the way out to it in bounds. These hold what a
 * section's drill rests on: the reading is seldom wrong about ground it calls out of view,
 * a way's stops are places a man can stand on open ground, its bounds are no longer than
 * they're allowed, and asking twice gives the same answer.
 */

const SEED = 'LEB-2534';
const G = T.brain.hunt.ground;

function overviews(world: World, count: number): Array<{ x: number; z: number }> {
  return [...world.report.camp!.perches].sort((a, b) => b.coverage - a.coverage || a.x - b.x || a.z - b.z).slice(0, count);
}

describe("a section's reading of the valley", () => {
  it('seldom calls ground out of view that a firing point can really see', () => {
    const world = worldOf(SEED);
    const nav = navigatorOf(world, T);
    const a = approachOf(world, T);
    const L = a.layer;
    let same = 0;
    let all = 0;
    let dead = 0;
    let deadSeen = 0;
    for (const p of overviews(world, 3)) {
      const e = eyesOn(world, p.x, p.z, G.eye);
      a.aim([p]);
      for (let c = 0; c < L.nx * L.nz; c++) {
        // The open ground round the camp: where a way may go.
        if (a.near(a.px[c]!, a.pz[c]!, 0) !== c) continue;
        const truth = nav.seesPoint(e.x, e.y, e.z, a.px[c]!, a.floor[c]! + G.head, a.pz[c]!);
        const read = a.lit(c);
        all++;
        if (read === truth) same++;
        if (!read) {
          dead++;
          if (truth) deadSeen++;
        }
      }
    }
    expect(all).toBeGreaterThan(5000);
    expect(same / all).toBeGreaterThan(0.88);
    expect(dead / all).toBeGreaterThan(0.2);
    expect(deadSeen / dead).toBeLessThan(0.08);
  });

  it('reads a listed firing point the same whether its view was kept or is read as it is asked for', () => {
    const world = worldOf(SEED);
    const a = approachOf(world, T);
    const p = overviews(world, 1)[0]!;
    const kept: boolean[] = [];
    a.aim([p]);
    for (let c = 0; c < a.layer.nx * a.layer.nz; c++) kept.push(a.near(a.px[c]!, a.pz[c]!, 0) === c && a.lit(c));
    // The same point a hair off the list is read place by place.
    a.aim([{ x: p.x + 1e-9, z: p.z }]);
    let differ = 0;
    for (let c = 0; c < kept.length; c++) if (a.near(a.px[c]!, a.pz[c]!, 0) === c && a.lit(c) !== kept[c]) differ++;
    expect(differ).toBe(0);
  });

  it('finds open ground beside a place indoors, and none in the middle of nowhere it can stand', () => {
    const world = worldOf(SEED);
    const a = approachOf(world, T);
    const site = world.camp.site;
    const c = a.near(site.x, site.z, 8);
    expect(c).toBeGreaterThanOrEqual(0);
    expect((a.layer.flags[c]! & Cell.Walkable) !== 0).toBe(true);
    const M = world.grid.map;
    expect((M.flags[cellIndex(M, a.px[c]!, a.pz[c]!)]! & Cell.Walkable) !== 0).toBe(true);
    // Off the map, and beyond the ground a section has any business on.
    expect(a.near(1e6, 0)).toBe(-1);
    expect(a.near(site.x + G.around + 60, site.z)).toBe(-1);
  });
});

describe('the way out to a firing point', () => {
  it('goes in bounds between places a man can stand, from the camp to the firing point', () => {
    const world = worldOf(SEED);
    const a = approachOf(world, T);
    const M = world.grid.map;
    const site = world.camp.site;
    const start = a.near(site.x, site.z, 8);
    const way = emptyWay();
    for (const p of overviews(world, 3)) {
      expect(a.aim([p]).way(a.px[start]!, a.pz[start]!, p.x, p.z, way), `a way to ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`).toBe(true);
      const n = way.lit.length;
      expect(way.stops.length).toBe(2 * n);
      expect(n).toBeGreaterThan(3);
      expect(way.stops[0]).toBe(a.px[start]);
      expect(way.stops[1]).toBe(a.pz[start]);
      // It ends on the firing point's own place.
      const end = Math.sqrt((way.stops[2 * n - 2]! - p.x) * (way.stops[2 * n - 2]! - p.x) + (way.stops[2 * n - 1]! - p.z) * (way.stops[2 * n - 1]! - p.z));
      expect(end).toBeLessThan(a.layer.cell * 2.5);
      let length = 0;
      for (let k = 0; k < n; k++) {
        const x = way.stops[2 * k]!;
        const z = way.stops[2 * k + 1]!;
        expect((M.flags[cellIndex(M, x, z)]! & Cell.Walkable) !== 0, `stop ${k} is somewhere a man can stand`).toBe(true);
        if (k === 0) continue;
        const d = Math.sqrt((x - way.stops[2 * k - 2]!) * (x - way.stops[2 * k - 2]!) + (z - way.stops[2 * k - 1]!) * (z - way.stops[2 * k - 1]!));
        length += d;
        // A bound is as long as it's allowed, give or take a place: a way goes by whole places.
        expect(d).toBeLessThanOrEqual((way.lit[k] === 1 ? G.bound.lit : G.bound.covered) + a.layer.cell * 1.5);
      }
      expect(way.length).toBeGreaterThanOrEqual(length - 1e-6);
      expect(way.exposed).toBeLessThanOrEqual(way.length);
    }
  });

  it('keeps out of view where the straight way does not, at the price of being longer', () => {
    const world = worldOf(SEED);
    const site = world.camp.site;
    const plain = { ...T, brain: { ...T.brain, hunt: { ...T.brain.hunt, ground: { ...G, price: 0, priceOn: 0 } } } };
    let covered = 0;
    let straight = 0;
    let coveredLength = 0;
    let straightLength = 0;
    const way = emptyWay();
    for (const p of overviews(world, 3)) {
      const a = approachOf(world, T);
      const start = a.near(site.x, site.z, 8);
      a.aim([p]).way(a.px[start]!, a.pz[start]!, p.x, p.z, way);
      covered += way.exposed;
      coveredLength += way.length;
      approachOf(world, plain).aim([p]).way(a.px[start]!, a.pz[start]!, p.x, p.z, way);
      straight += way.exposed;
      straightLength += way.length;
    }
    expect(covered).toBeLessThan(straight);
    expect(coveredLength).toBeGreaterThanOrEqual(straightLength);
  });

  it('is the same way every time it is asked for', () => {
    const world = worldOf(SEED);
    const a = approachOf(world, T);
    const site = world.camp.site;
    const start = a.near(site.x, site.z, 8);
    const [p, q] = overviews(world, 2) as [{ x: number; z: number }, { x: number; z: number }];
    const first = emptyWay();
    const again = emptyWay();
    a.aim([p, q]).way(a.px[start]!, a.pz[start]!, p.x, p.z, first);
    // Something else asked in between changes nothing.
    a.aim([q]).way(a.px[start]!, a.pz[start]!, q.x, q.z, again);
    a.aim([p, q]).way(a.px[start]!, a.pz[start]!, p.x, p.z, again);
    expect(again).toEqual(first);
  });

  it('says so when there is no way: somewhere off the ground a section goes on', () => {
    const world = worldOf(SEED);
    const a = approachOf(world, T);
    const site = world.camp.site;
    const start = a.near(site.x, site.z, 8);
    const way = emptyWay();
    expect(a.aim([]).way(a.px[start]!, a.pz[start]!, site.x + G.around + 200, site.z, way)).toBe(false);
    expect(way.stops.length).toBe(0);
  });
});
