import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { generateWorld } from '../src/sim/generation/world';
import { dtanDeg } from '../src/sim/kernel/core/detmath';
import { missionSpec } from '../src/sim/kernel/mission';
import { Blocks } from '../src/sim/kernel/world/colliders';
import { CLIMB_SLACK, Cell, Edge, cellAt, cellIndex, type GridLayer } from '../src/sim/kernel/world/grid';
import { Surface } from '../src/sim/kernel/world/surfaces';
import { testWorld } from './fixtures';

const has = (L: GridLayer, x: number, z: number, flag: number): boolean => (L.flags[cellIndex(L, x, z)]! & flag) !== 0;

describe('the spatial grid', () => {
  it('is built for the player-sized body the motor moves', () => {
    expect(T.gen.grid.bodyRadius).toBe(T.bodies.player.radius);
    expect(T.gen.grid.stepHeight).toBe(T.bodies.player.stepHeight);
    expect(T.gen.grid.bodyHeight).toBe(T.bodies.player.height.stand);
  });

  it('lets a body through a 1.2 m doorway in the fine layer, which the coarse layer cannot show', () => {
    // A wall along z = 0 from x = −20 to 20, with a doorway from x = −0.6 to 0.6.
    const wall = (x: number, hx: number) => ({ kind: 'box' as const, x, z: 0, y0: -1, y1: 3, hx, hz: 0.1, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Wood });
    const w = testWorld({ colliders: [wall(-10.3, 9.7), wall(10.3, 9.7)], spawn: { x: 0, z: 10 } });
    const { site, map } = w.grid;
    expect(has(site, 0, 0, Cell.Walkable)).toBe(true);
    expect(has(site, 3, 0, Cell.Walkable)).toBe(false);
    expect(cellAt(w.grid, 0, 0)!.layer).toBe(site);
    // Through the doorway, fine cells connect north to south; beside it they don't.
    const crosses = (L: GridLayer, x: number): boolean => {
      const k = cellIndex(L, x, -L.cell / 2);
      return (L.edges[k]! & Edge.North) !== 0;
    };
    expect(crosses(site, 0)).toBe(true);
    expect(crosses(site, 5)).toBe(false);
    // The coarse layer's cell centres sit either side of the wall and both fit a body;
    // only its edges know the wall is there, and they close the doorway too.
    expect(has(map, 5, 1, Cell.Walkable) && has(map, 5, -1, Cell.Walkable)).toBe(true);
    expect(crosses(map, 5)).toBe(false);
    expect(crosses(map, 1)).toBe(false);
  });

  it('marks what stops sound, what is roofed, and how tall the cover is', () => {
    const w = testWorld({
      colliders: [
        { kind: 'box', x: 10, z: 0, y0: -1, y1: 3, hx: 2, hz: 2, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Wood }, // a hut
        { kind: 'box', x: 20, z: 0, y0: -1, y1: 2, hx: 0.05, hz: 4, ux: 1, uz: 0, flags: Blocks.Move, surface: Surface.Metal }, // a fence
        { kind: 'box', x: 30, z: 0, y0: -1, y1: 0.95, hx: 0.4, hz: 2, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Dirt }, // sandbags
        { kind: 'box', x: 40, z: 0, y0: 2.5, y1: 2.7, hx: 3, hz: 3, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Metal }, // a roof
      ],
    });
    const { site } = w.grid;
    expect(has(site, 10, 0, Cell.BlocksSound)).toBe(true);
    expect(has(site, 20, 0, Cell.BlocksSound)).toBe(false);
    expect(has(site, 30, 0, Cell.BlocksSound)).toBe(false);
    expect(site.cover[cellIndex(site, 30, 0)]).toBe(10); // 0.95 m above the ground, in decimetres
    expect(has(site, 40, 0, Cell.Roofed)).toBe(true);
    expect(has(site, 40, 0, Cell.Walkable)).toBe(true); // headroom under the roof
    expect(has(site, 10, 0, Cell.Walkable)).toBe(false);
  });

  it('marks ground too steep to stand on', () => {
    const w = testWorld({ height: (x) => (x > 20 ? (x - 20) * 1.5 : 0) });
    expect(has(w.grid.site, 30, 0, Cell.Steep)).toBe(true);
    expect(has(w.grid.site, 30, 0, Cell.Walkable)).toBe(false);
    expect(has(w.grid.site, 10, 0, Cell.Walkable)).toBe(true);
  });

  it('marks the walk that climbs a triangle neither cell answered for, and leaves the cells and their other edges alone', () => {
    // A 35 degree ramp up to the east, on a test world's 2 m terrain, with one vertex dipped,
    // at (30, 10). The cell from x 30 to 32 and z 8 to 10 has it as its (i, j + 1) corner: the
    // triangle its middle lies on is the ramp's 35 degrees, and its other one is 49. The cell
    // west of it has the dip on the triangle under its middle, at 39 degrees: walkable too.
    const w = testWorld({ height: (x, z) => 0.7 * (Math.min(34, Math.max(26, x)) - 26) + (x === 30 && z === 10 ? -0.8 : 0), spawnOnTop: true });
    expect(w.terrain.cell).toBe(2);
    const tanMax = dtanDeg(T.gen.walkableSlopeDeg);
    const { map, site } = w.grid;
    expect(has(map, 31, 9, Cell.Walkable)).toBe(true);
    expect(has(map, 29, 9, Cell.Walkable)).toBe(true);
    // West to east, middle to middle, runs up the steep triangle: 1.1 m gained in a metre. Back down it gains nothing.
    expect(w.terrain.gainOnSteep(29, 9, 31, 9, tanMax)).toBeCloseTo(1.1, 5);
    expect(w.terrain.gainOnSteep(31, 9, 29, 9, tanMax)).toBe(0);
    // A body fits along that edge, and it's marked: one mark for both ways.
    const west = cellIndex(map, 29, 9);
    expect(map.edges[west]! & (Edge.East | Edge.EastSteep)).toBe(Edge.East | Edge.EastSteep);
    // The cell's other ways lie on the triangle under its middle: east, and from the south.
    const here = cellIndex(map, 31, 9);
    const south = cellIndex(map, 31, 7);
    expect(map.edges[here]! & (Edge.East | Edge.EastSteep)).toBe(Edge.East);
    expect(map.edges[south]! & (Edge.North | Edge.NorthSteep)).toBe(Edge.North);
    // North of it the ground is steep under a cell's own middle: no edge, so nothing to mark.
    expect(has(map, 31, 11, Cell.Steep)).toBe(true);
    expect(map.edges[here]! & (Edge.North | Edge.NorthSteep)).toBe(0);
    // The fine layer isn't marked.
    expect(site.edges.some((e) => (e & (Edge.EastSteep | Edge.NorthSteep)) !== 0)).toBe(false);
  });

  it('marks every walk of a valley’s map that the motor would refuse, and no other', () => {
    // HEL-2923 is where it showed: a guard at a run stopped dead at (132.5, -94.2), on the west
    // edge of a cell that is 27 degrees under its middle and 45 on its other triangle, five
    // times, and gave the walk up.
    const w = generateWorld(missionSpec('HEL-2923'), T);
    const tanMax = dtanDeg(T.gen.walkableSlopeDeg);
    const L = w.grid.map;
    expect(has(L, 133.75, -93.75, Cell.Walkable)).toBe(true);
    expect(L.edges[cellIndex(L, 131.25, -93.75)]! & (Edge.East | Edge.EastSteep)).toBe(Edge.East | Edge.EastSteep);
    // Every edge a body fits along, walked both ways on the ground's own triangles: marked
    // where it gains height on ground too steep to climb, which is what the motor refuses,
    // and nowhere else. And no mark without an edge.
    let fits = 0;
    let marked = 0;
    let wrong = 0;
    for (let j = 0; j < L.nz; j++) {
      for (let i = 0; i < L.nx; i++) {
        const e = L.edges[j * L.nx + i]!;
        const x = L.x0 + (i + 0.5) * L.cell;
        const z = L.z0 + (j + 0.5) * L.cell;
        for (const [bit, steep, dx, dz] of [[Edge.East, Edge.EastSteep, L.cell, 0], [Edge.North, Edge.NorthSteep, 0, L.cell]] as const) {
          if ((e & bit) === 0) {
            if ((e & steep) !== 0) wrong++;
            continue;
          }
          fits++;
          const climbs = w.terrain.gainOnSteep(x, z, x + dx, z + dz, tanMax) > CLIMB_SLACK || w.terrain.gainOnSteep(x + dx, z + dz, x, z, tanMax) > CLIMB_SLACK;
          if ((e & steep) !== 0) marked++;
          if (climbs !== ((e & steep) !== 0)) wrong++;
        }
      }
    }
    expect(fits).toBeGreaterThan(400000);
    expect(marked).toBeGreaterThan(100);
    expect(wrong).toBe(0);
    // The site layer carries none.
    expect(w.grid.site.edges.some((e) => (e & (Edge.EastSteep | Edge.NorthSteep)) !== 0)).toBe(false);
  });

  it("covers the generated camp, whose buildings stop bodies and sound", () => {
    const w = generateWorld(missionSpec('TAL-4471'), T);
    let buildings = 0;
    let blocked = 0;
    let sound = 0;
    for (const st of w.camp.structures) {
      if (st.kind !== 'building') continue;
      buildings++;
      const c = w.colliders.list[st.colliders[0]!]!;
      expect(cellAt(w.grid, c.x, c.z)!.layer).toBe(w.grid.site);
      if (!has(w.grid.site, c.x, c.z, Cell.Walkable)) blocked++;
      // A 20 cm wall can fall between cell centres: the flood goes round it along walkable
      // edges, and the straight line loses a wall's worth by the collider's own flag (hearing.ts).
      if ((c.flags & Blocks.Sound) !== 0) sound++;
    }
    expect(buildings).toBeGreaterThan(3);
    expect(blocked).toBe(buildings);
    expect(sound).toBe(buildings);
    // Guards stand on walkable cells (sentries on their decks aside).
    for (const g of w.camp.guards) if (!g.elevated) expect(has(w.grid.site, g.x, g.z, Cell.Walkable), `guard ${g.id}`).toBe(true);
  });
});
