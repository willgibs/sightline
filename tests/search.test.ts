import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { generateWorld } from '../src/sim/generation';
import { Hasher } from '../src/sim/kernel/core/hash';
import { Rng } from '../src/sim/kernel/core/rng';
import { missionSpec } from '../src/sim/kernel/mission';
import { Blocks } from '../src/sim/kernel/world/colliders';
import { Cell, Edge, cellIndex, type GridLayer } from '../src/sim/kernel/world/grid';
import { COST_PER_METRE, GridSearch } from '../src/sim/kernel/world/search';
import { Surface } from '../src/sim/kernel/world/surfaces';
import { testWorld } from './fixtures';

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
});
