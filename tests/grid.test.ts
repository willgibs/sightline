import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { generateWorld } from '../src/sim/gen/world';
import { missionSpec } from '../src/sim/mission';
import { Blocks } from '../src/sim/world/colliders';
import { Cell, Edge, cellAt, cellIndex, type GridLayer } from '../src/sim/world/grid';
import { Surface } from '../src/sim/world/surfaces';
import { testWorld } from './fixtures';

const has = (L: GridLayer, x: number, z: number, flag: number): boolean => (L.flags[cellIndex(L, x, z)]! & flag) !== 0;

describe('the spatial grid', () => {
  it('is built for the player-sized body the motor moves', () => {
    expect(T.gen.grid.bodyRadius).toBe(T.player.radius);
    expect(T.gen.grid.stepHeight).toBe(T.player.stepHeight);
    expect(T.gen.grid.bodyHeight).toBe(T.player.height.stand);
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

  it("covers the generated camp, whose buildings stop bodies and sound", () => {
    const w = generateWorld(missionSpec('TAL-4471'), T);
    let blocked = 0;
    let sound = 0;
    for (const st of w.camp.structures) {
      if (st.kind !== 'building') continue;
      const c = w.colliders.list[st.colliders[0]!]!;
      expect(cellAt(w.grid, c.x, c.z)!.layer).toBe(w.grid.site);
      if (!has(w.grid.site, c.x, c.z, Cell.Walkable)) blocked++;
      if (has(w.grid.site, c.x, c.z, Cell.BlocksSound)) sound++;
    }
    expect(blocked).toBe(4);
    expect(sound).toBe(4);
    // Guards stand on walkable cells (sentries on their decks aside).
    for (const g of w.camp.guards) if (!g.elevated) expect(has(w.grid.site, g.x, g.z, Cell.Walkable), `guard ${g.id}`).toBe(true);
  });
});
