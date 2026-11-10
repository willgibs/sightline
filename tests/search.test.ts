import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { generateWorld } from '../src/sim/generation';
import { Hasher } from '../src/sim/kernel/core/hash';
import { Rng } from '../src/sim/kernel/core/rng';
import { missionSpec } from '../src/sim/kernel/mission';
import { Blocks } from '../src/sim/kernel/world/colliders';
import { Cell, Edge, cellIndex, type GridLayer } from '../src/sim/kernel/world/grid';
import { COST_PER_METRE, GridSearch, components, distanceTable, landmarkTables } from '../src/sim/kernel/world/search';
import { Surface } from '../src/sim/kernel/world/surfaces';
import { testWorld } from './fixtures';
import { ReferenceSearch } from './reference/gridSearchReference';

/** A wall along z = 0 from x = −20 to 20, with a 1.2 m doorway at x = 0. */
const wall = (x: number, hx: number) => ({ kind: 'box' as const, x, z: 0, y0: -1, y1: 3, hx, hz: 0.1, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Wood });
const doorway = testWorld({ colliders: [wall(-10.3, 9.7), wall(10.3, 9.7)], spawn: { x: 0, z: 10 } });
const open = testWorld();
const valley = generateWorld(missionSpec('TAL-4471'), T);

const at = (L: GridLayer, x: number, z: number): number => cellIndex(L, x, z);
const ALL = 10_000_000;

/** True if a body can make the move from a to its neighbour b by the layer's walk edges. */
function moveOpen(L: GridLayer, a: number, b: number): boolean {
  const [ai, aj] = [a % L.nx, Math.floor(a / L.nx)];
  const [bi, bj] = [b % L.nx, Math.floor(b / L.nx)];
  const side = (i: number, j: number, di: number, dj: number): boolean =>
    di === 1 ? (L.edges[j * L.nx + i]! & Edge.East) !== 0 : di === -1 ? (L.edges[j * L.nx + i - 1]! & Edge.East) !== 0 : dj === 1 ? (L.edges[j * L.nx + i]! & Edge.North) !== 0 : (L.edges[(j - 1) * L.nx + i]! & Edge.North) !== 0;
  const di = bi - ai;
  const dj = bj - aj;
  if (Math.abs(di) > 1 || Math.abs(dj) > 1 || (di === 0 && dj === 0)) return false;
  if (di === 0 || dj === 0) return side(ai, aj, di, dj);
  return side(ai, aj, di, 0) && side(ai + di, aj, 0, dj) && side(ai, aj, 0, dj) && side(ai, aj + dj, di, 0);
}

describe('grid search', () => {
  it('floods open ground with exact octile distances, or Manhattan ones on four neighbours', () => {
    const L = open.grid.site;
    const s = new GridSearch(L);
    const src = at(L, 0, 0);
    const r = s.flood([src], { maxExpansions: ALL });
    expect(r.exhausted).toBe(false);
    expect(s.side).toBe(50);
    expect(s.corner).toBe(71);
    for (const [x, z] of [
      [5, 0],
      [3, 4],
      [-7.5, 2],
      [20, -20],
    ] as const) {
      const c = at(L, x, z);
      expect(s.cost[c], `${x}, ${z}`).toBe(s.estimate(src, c));
    }
    s.flood([src], { neighbours: 4, maxExpansions: ALL });
    expect(s.cost[at(L, 3, 4)]).toBe(s.estimate(src, at(L, 3, 4), false));
    expect(s.cost[at(L, 3, 4)]).toBe(7 * COST_PER_METRE);
  });

  it('goes round a wall through its doorway, on the fine layer', () => {
    const L = doorway.grid.site;
    const s = new GridSearch(L);
    const from = at(L, 5, -3);
    s.flood([from], { maxExpansions: ALL });
    const beyond = at(L, 5, 3);
    // Through the doorway at x = 0: over 10 m, against 6 m straight through the wall.
    expect(s.cost[beyond]! / COST_PER_METRE).toBeGreaterThan(10);
    // Every cell's parent is a neighbour it can walk to: a real path, every step of it.
    for (let c = beyond; s.parent[c]! >= 0; c = s.parent[c]!) expect(moveOpen(L, s.parent[c]!, c)).toBe(true);
    // A cell inside the wall is never reached.
    expect((L.flags[at(L, 5, 0)]! & Cell.Walkable) === 0 && s.cost[at(L, 5, 0)]).toBe(-1);
  });

  it('stops at its reach, and after its budget, and says so', () => {
    const L = open.grid.site;
    const s = new GridSearch(L);
    const src = at(L, 0, 0);
    s.flood([src], { maxExpansions: ALL, maxCost: 300 });
    let reached = 0;
    for (let c = 0; c < s.cost.length; c++) {
      if (s.cost[c]! < 0) continue;
      reached++;
      expect(s.cost[c]).toBeLessThanOrEqual(300);
    }
    expect(reached).toBeGreaterThan(100);
    const r = s.flood([src], { maxExpansions: 50 });
    expect(r).toEqual({ expanded: 50, exhausted: true });
    // Nothing of a search is left in the next: the last one reached only its own cells.
    expect(Array.from(s.cost).filter((c) => c >= 0).length).toBeLessThan(200);
  });

  it('finds what Dijkstra finds with A*, expanding no more, on both layers', () => {
    const rng = new Rng('SEARCH-0001', 'pairs');
    for (const L of [valley.grid.site, valley.grid.map, doorway.grid.site]) {
      const a = new GridSearch(L);
      const d = new GridSearch(L);
      const walkable: number[] = [];
      for (let c = 0; c < L.flags.length; c++) if (L.flags[c]! & Cell.Walkable) walkable.push(c);
      for (let k = 0; k < 6; k++) {
        const start = walkable[Math.floor(rng.next() * walkable.length)]!;
        const goal = walkable[Math.floor(rng.next() * walkable.length)]!;
        const path: number[] = [];
        const p = a.path(start, goal, { maxExpansions: ALL }, path);
        const f = d.flood([start], { maxExpansions: ALL });
        expect(p.cost).toBe(d.cost[goal]);
        expect(p.found).toBe(d.cost[goal]! >= 0);
        if (!p.found) continue;
        expect(p.expanded).toBeLessThanOrEqual(f.expanded);
        expect(path[0]).toBe(start);
        expect(path.at(-1)).toBe(goal);
        let sum = 0;
        for (let q = 1; q < path.length; q++) {
          expect(moveOpen(L, path[q - 1]!, path[q]!)).toBe(true);
          const [di, dj] = [(path[q]! % L.nx) - (path[q - 1]! % L.nx), Math.floor(path[q]! / L.nx) - Math.floor(path[q - 1]! / L.nx)];
          sum += di !== 0 && dj !== 0 ? a.corner : a.side;
        }
        expect(sum).toBe(p.cost);
      }
    }
  });

  it('prices or closes moves through its cost function, in whole numbers only', () => {
    const L = doorway.grid.site;
    const s = new GridSearch(L);
    const start = at(L, -5, -3);
    const goal = at(L, -5, 3);
    const free = s.path(start, goal, { maxExpansions: ALL });
    expect(free.found).toBe(true);
    expect(free.cost / COST_PER_METRE).toBeLessThan(15);
    // Price the doorway dearly, and the path goes round the end of the wall, 20 m away.
    const z = (c: number): number => L.z0 + (Math.floor(c / L.nx) + 0.5) * L.cell;
    const x = (c: number): number => L.x0 + ((c % L.nx) + 0.5) * L.cell;
    const toll = s.path(start, goal, { maxExpansions: ALL, cost: (_from, to, length) => (Math.abs(x(to)) < 1 && Math.abs(z(to)) < 1 ? length + 1_000_000 : length) });
    expect(toll.found).toBe(true);
    expect(toll.cost / COST_PER_METRE).toBeGreaterThan(30);
    expect(toll.cost).toBeLessThan(1_000_000);
    // Close every move across the line of the wall, and there is no way at all.
    const shut = s.path(start, goal, { maxExpansions: ALL, cost: (_from, to, length) => (Math.abs(z(to)) < 0.5 ? -1 : length) });
    expect(shut).toMatchObject({ found: false, cost: -1, exhausted: false });
    expect(() => s.path(start, goal, { maxExpansions: ALL, cost: (_f, _t, length) => length * 1.5 })).toThrow(/whole numbers/);
  });

  it('gives the same answer every time, with ties broken the same way', () => {
    const L = valley.grid.map;
    const fingerprint = (): string => {
      const s = new GridSearch(L);
      const h = new Hasher();
      const site = valley.camp.site;
      s.flood([at(L, site.x, site.z)], { maxExpansions: ALL, maxCost: 400 * COST_PER_METRE });
      for (let c = 0; c < s.cost.length; c++) h.u32(s.cost[c]! + 1).u32(s.parent[c]! + 1);
      const path: number[] = [];
      const r = s.path(at(L, valley.spawn.x, valley.spawn.z), at(L, site.x, site.z), { maxExpansions: ALL }, path);
      h.u32(r.expanded).u32(r.cost + 1);
      for (const c of path) h.u32(c);
      return h.digest();
    };
    expect(fingerprint()).toBe(fingerprint());
  });

  /**
   * The search the game runs is written for speed. This holds it to the plain one it
   * replaced (tests/reference/gridSearchReference.ts) on real ground: the same result, the
   * same cost and parent in every cell, and the same path, for floods and routes with every
   * option they take. It's what lets the fast one change without a world or a run moving.
   */
  it('does exactly what the plain search does, cell for cell', () => {
    const rng = new Rng('SEARCH-0002', 'twin');
    const pick = (list: readonly number[]): number => list[Math.floor(rng.next() * list.length)]!;
    for (const L of [valley.grid.site, valley.grid.map, doorway.grid.site]) {
      const fast = new GridSearch(L);
      const plain = new ReferenceSearch(L);
      const walkable: number[] = [];
      for (let c = 0; c < L.flags.length; c++) if (L.flags[c]! & Cell.Walkable) walkable.push(c);
      const same = (what: string): void => {
        let differ = -1;
        for (let c = 0; c < fast.cost.length && differ < 0; c++) if (fast.cost[c] !== plain.cost[c] || fast.parent[c] !== plain.parent[c]) differ = c;
        expect(differ, `${what}: cell ${differ}`).toBe(-1);
      };
      // A toll by where a move lands, and some cells shut: whole numbers, never less than the move's length.
      // And for floods, which take any cost from nothing up, some moves that are free.
      const toll = (_from: number, to: number, length: number): number => (to % 13 === 0 ? -1 : to % 7 === 0 ? length + ((to * 31) % 400) : length);
      const free = (from: number, to: number, length: number): number => (to % 11 === 0 ? 0 : toll(from, to, length));
      for (let k = 0; k < 10; k++) {
        const sources = [pick(walkable), pick(walkable), pick(walkable)].slice(0, 1 + (k % 3));
        for (const opts of [
          { maxExpansions: ALL },
          { maxExpansions: ALL, neighbours: 4 as const },
          { maxExpansions: ALL, maxCost: 40 * COST_PER_METRE },
          { maxExpansions: 700 },
          { maxExpansions: ALL, cost: toll },
          // Moves that cost nothing, and dear ones: the queue's ring has to grow, and equal costs pile up.
          { maxExpansions: 5000, cost: free, maxCost: 90 * COST_PER_METRE },
        ]) {
          expect(fast.flood(sources, opts), JSON.stringify(opts)).toEqual(plain.flood(sources, opts));
          same(`flood ${k} ${JSON.stringify(opts)}`);
        }
        const start = pick(walkable);
        const goal = pick(walkable);
        for (const opts of [{ maxExpansions: ALL }, { maxExpansions: ALL, neighbours: 4 as const }, { maxExpansions: 300 }, { maxExpansions: ALL, cost: toll }]) {
          const a: number[] = [];
          const b: number[] = [];
          expect(fast.path(start, goal, opts, a), JSON.stringify(opts)).toEqual(plain.path(start, goal, opts, b));
          expect(a).toEqual(b);
          same(`path ${k} ${JSON.stringify(opts)}`);
        }
      }
    }
  }, 120_000);
});

describe('landmarks', () => {
  /** A yard walled on three sides, open to the south: 3 m across a wall is 40 m round it. */
  const yard = testWorld({ colliders: [wall(0, 15), { ...wall(0, 15), x: -15, z: 10, hx: 0.1, hz: 10 }, { ...wall(0, 15), x: 15, z: 10, hx: 0.1, hz: 10 }], spawn: { x: 0, z: -10 } });

  it('labels ground by what can be walked to from what', () => {
    // A room with no door: its floor is ground of its own.
    const room = [wall(0, 3), { ...wall(0, 3), z: 6 }, { ...wall(0, 3), x: -3, z: 3, hx: 0.1, hz: 3 }, { ...wall(0, 3), x: 3, z: 3, hx: 0.1, hz: 3 }];
    const sealed = testWorld({ colliders: room, spawn: { x: 0, z: -10 } });
    const L = sealed.grid.site;
    const s = new GridSearch(L);
    const ground = components(s);
    const inside = at(L, 0, 3);
    const outside = at(L, 0, -5);
    expect(ground.label[inside]).toBeGreaterThanOrEqual(0);
    expect(ground.label[outside]).toBeGreaterThanOrEqual(0);
    expect(ground.label[inside]).not.toBe(ground.label[outside]);
    // Inside a wall no move leads anywhere: it's nobody's ground.
    expect(ground.label[at(L, 0, 0)]).toBe(-1);
    // The label is the truth a search would reach: reachable exactly when the labels match.
    s.flood([outside], { maxExpansions: ALL });
    for (let c = 0; c < s.cost.length; c += 7) expect(s.cost[c]! >= 0, `cell ${c}`).toBe(ground.label[c] === ground.label[outside]);
    expect(ground.sizes.reduce((a, b) => a + b, 0)).toBe(Array.from(ground.label).filter((l) => l >= 0).length);
  });

  it('finds a path of the same cost, looking at far fewer cells round a wall', () => {
    const L = yard.grid.site;
    const s = new GridSearch(L);
    const bounds = landmarkTables(new GridSearch(L), at(L, 0, -10), 8);
    expect(bounds.count).toBe(8);
    expect(bounds.table.length).toBe(L.nx * L.nz * 8);
    // 1.5 m either side of the north wall: the way is out of the yard's mouth and round.
    const start = at(L, 0, 1.5);
    const goal = at(L, 0, -1.5);
    const plain: number[] = [];
    const aimed: number[] = [];
    const a = s.path(start, goal, { maxExpansions: ALL }, plain);
    const b = s.path(start, goal, { maxExpansions: ALL, bounds }, aimed);
    expect(a.found && b.found).toBe(true);
    expect(b.cost).toBe(a.cost);
    expect(a.cost / COST_PER_METRE).toBeGreaterThan(40);
    expect(b.expanded).toBeLessThan(a.expanded / 4);
    for (let q = 1; q < aimed.length; q++) expect(moveOpen(L, aimed[q - 1]!, aimed[q]!)).toBe(true);
    expect(aimed[0]).toBe(start);
    expect(aimed.at(-1)).toBe(goal);
  });

  it('never costs a path more than the plain search finds, on real ground, with tolls and without', () => {
    const rng = new Rng('SEARCH-0003', 'landmarks');
    for (const L of [valley.grid.site, doorway.grid.site]) {
      const s = new GridSearch(L);
      const ground = components(new GridSearch(L));
      const walkable: number[] = [];
      for (let c = 0; c < L.flags.length; c++) if (ground.label[c] === 0) walkable.push(c);
      const bounds = landmarkTables(new GridSearch(L), walkable[0]!, 6);
      const toll = (_from: number, to: number, length: number): number => (to % 13 === 0 ? -1 : to % 7 === 0 ? length + ((to * 31) % 400) : length);
      let plainWork = 0;
      let aimedWork = 0;
      for (let k = 0; k < 40; k++) {
        const start = walkable[Math.floor(rng.next() * walkable.length)]!;
        const goal = walkable[Math.floor(rng.next() * walkable.length)]!;
        for (const cost of [undefined, toll]) {
          const a = s.path(start, goal, { maxExpansions: ALL, cost });
          const b = s.path(start, goal, { maxExpansions: ALL, cost, bounds });
          expect(b.found, `${start} to ${goal}`).toBe(a.found);
          expect(b.cost, `${start} to ${goal}`).toBe(a.cost);
          // A sharper estimate never makes A* look at more than it did, ties aside.
          plainWork += a.expanded;
          aimedWork += b.expanded;
        }
      }
      expect(aimedWork).toBeLessThan(plainWork);
    }
  });

  it('chooses the same cells every time, each as far from the others as the ground allows', () => {
    const L = yard.grid.site;
    const seed = at(L, 0, -10);
    const one = landmarkTables(new GridSearch(L), seed, 4);
    const two = landmarkTables(new GridSearch(L), seed, 4);
    expect(Array.from(one.table)).toEqual(Array.from(two.table));
    // A landmark is the one cell its own table has at no cost: four of them, all different.
    const marks: number[] = [];
    for (let t = 0; t < one.count; t++) for (let c = 0; c < L.nx * L.nz; c++) if (one.table[c * one.count + t] === 0) marks.push(c);
    expect(new Set(marks).size).toBe(4);
    // The first is the cell farthest from where the choosing began.
    const from = distanceTable(new GridSearch(L), seed);
    expect(from[marks[0]!]).toBe(from.reduce((most, v) => Math.max(most, v), 0));
    // Ground with fewer cells than landmarks asked for gives what it has.
    expect(landmarkTables(new GridSearch(L), seed, 0).count).toBe(0);
  });
});
