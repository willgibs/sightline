import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ActionMap, DEFAULT_ACTIONS } from '../src/app/actions';
import { showsPlayerHud } from '../src/app/hud';
import { kitFields, type RifleReadout } from '../src/app/kit';
import { insideQuad, MAP_LARGE, MAP_SMALL, mapPoint, mapSide, nextMapMode, roofOf, satelliteOf, scaleBarMetres, type MapMode } from '../src/app/minimap';
import { defaultTuning as T } from '../src/config/tuning';
import { SCENES } from '../src/sim/game/scenes';
import { campMission, defaultCampSpec, generateWorld } from '../src/sim/generation';
import { Blocks } from '../src/sim/kernel/world/colliders';
import { Surface } from '../src/sim/kernel/world/surfaces';
import type { World } from '../src/sim/kernel/world/world';
import { testWorld } from './fixtures';

/** The player's heads-up display in the honest view: what's read off the rifle, and what the satellite saw. */

const rifle = (over: Partial<RifleReadout> = {}): RifleReadout => ({ rounds: 15, zero: 100, fitting: 0, swapping: false, suppressed: false, load: 'match', ...over });

describe('the kit', () => {
  it('says what the body is doing, with or without a rifle', () => {
    expect(kitFields('crouch', false, null)).toEqual({ stance: 'crouch', settling: false, rifle: null });
    expect(kitFields('prone', true, rifle()).settling).toBe(true);
  });

  it('tells the suppressor on from off, and fitting from removing', () => {
    const suppressor = (over: Partial<RifleReadout>) => kitFields('stand', false, rifle(over)).rifle!.suppressor;
    expect(suppressor({ suppressed: false })).toBe('off');
    expect(suppressor({ suppressed: true })).toBe('on');
    // The simulation flips it when the job starts, so it already says how it will end.
    expect(suppressor({ suppressed: true, fitting: 2 })).toBe('fitting');
    expect(suppressor({ suppressed: false, fitting: 2 })).toBe('removing');
  });

  it("doesn't take a change of load for the suppressor", () => {
    const f = kitFields('stand', false, rifle({ suppressed: true, fitting: 1.5, swapping: true, load: 'subsonic' })).rifle!;
    expect(f.suppressor).toBe('on');
    expect(f.load).toBe('subsonic');
    expect(f.loading).toBe(true);
    expect(f.busy).toBe(1.5);
    expect(kitFields('stand', false, rifle({ suppressed: true, fitting: 1.5 })).rifle!.loading).toBe(false);
  });

  it('carries the load, the rounds and the zero through as they are', () => {
    const f = kitFields('stand', false, rifle({ rounds: 3, zero: 300, load: 'subsonic' })).rifle!;
    expect([f.rounds, f.zero, f.load]).toEqual([3, 300, 'subsonic']);
  });
});

describe('when the readouts are on screen', () => {
  const playing = { replay: false, trial: false, bench: false, detached: false, scene: null };

  it('is when someone is playing, in their own eyes', () => {
    expect(showsPlayerHud(playing)).toBe(true);
    expect(showsPlayerHud({ ...playing, scene: 'live-camp' })).toBe(true);
  });

  it('is not in a replay, a blind sitting, a benchmark, the fly camera or the compound simulator', () => {
    expect(showsPlayerHud({ ...playing, replay: true })).toBe(false);
    expect(showsPlayerHud({ ...playing, trial: true })).toBe(false);
    expect(showsPlayerHud({ ...playing, bench: true })).toBe(false);
    expect(showsPlayerHud({ ...playing, detached: true })).toBe(false);
    expect(showsPlayerHud({ ...playing, scene: 'compound' })).toBe(false);
  });
});

describe('the map key', () => {
  it('goes small, enlarged, away, and round again', () => {
    const seen: MapMode[] = ['small'];
    for (let k = 0; k < 3; k++) seen.push(nextMapMode(seen[seen.length - 1]!));
    expect(seen).toEqual(['small', 'large', 'hidden', 'small']);
  });

  it('is a key of its own, on foot, and named for the player', () => {
    const inputs = DEFAULT_ACTIONS.minimap.inputs;
    expect(DEFAULT_ACTIONS.minimap.context).toBe('play');
    for (const [action, spec] of Object.entries(DEFAULT_ACTIONS)) if (action !== 'minimap') for (const i of inputs) expect(spec.inputs, action).not.toContain(i);
    expect(new ActionMap().describe('minimap')).toBe('1');
  });

  it('keeps the map small unless asked, and enlarged it leaves most of the world showing', () => {
    expect(mapSide('small', 1920, 1080)).toBe(MAP_SMALL);
    expect(mapSide('large', 3840, 2160)).toBe(MAP_LARGE);
    for (const [w, h] of [[1280, 720], [800, 800], [640, 360]] as const) {
      expect(mapSide('small', w, h)).toBeLessThanOrEqual(MAP_SMALL);
      expect(mapSide('small', w, h)).toBeLessThanOrEqual(0.36 * h);
      expect(mapSide('large', w, h)).toBeLessThanOrEqual(0.62 * h);
      expect(mapSide('large', w, h)).toBeLessThanOrEqual(0.56 * w);
    }
  });

  it('marks a round distance that fits the picture', () => {
    expect(scaleBarMetres(1140)).toBe(200);
    expect(scaleBarMetres(750)).toBe(100);
    expect(scaleBarMetres(190)).toBe(20);
  });
});

describe('what the satellite saw', () => {
  // A chain-link camp, whose only blocks are the screens inside the target's building, and a walled one.
  const chain = generateWorld(campMission('TAL-4471', defaultCampSpec(), 'overlook'), T);
  const walled = generateWorld(campMission('MUD-2210', defaultCampSpec(), 'overlook'), T);
  const count = (w: World, kind: string): number => w.camp.structures.filter((s) => s.kind === kind).length;

  it('is the shape of the ground, the fence and the roofs, the road, the creek and the woods', () => {
    const s = satelliteOf(chain)!;
    expect(Object.keys(s).sort()).toEqual(['creek', 'fence', 'road', 'roofs', 'side', 'terrain', 'trees', 'walls', 'x0', 'z0']);
    expect(s.terrain).toBe(chain.terrain);
    expect(s.road).toBe(chain.features.road.points);
    expect(s.creek).toBe(chain.features.creek.points);
    expect(s.trees).toBe(chain.props.trees);
    expect(s.fence.length).toBeGreaterThan(0);
    // Each fence piece a line of its own, and its gaps (the gates) left open.
    expect(s.fence.length).toBe(chain.camp.structures.filter((c) => c.kind === 'fence').reduce((n, c) => n + c.colliders.length, 0));
  });

  it('shows each building as one outline, whatever its walls and doors are made of', () => {
    for (const w of [chain, walled]) expect(satelliteOf(w)!.roofs.length).toBe(count(w, 'building') + count(w, 'shed'));
    // Four corners, round the roof: each building's rectangle holds all of its parts' centres.
    const s = satelliteOf(chain)!;
    const buildings = chain.camp.structures.filter((c) => c.kind === 'building');
    for (const b of buildings) {
      const parts = b.colliders.map((id) => chain.colliders.list[id]!);
      const roof = s.roofs.find((q) => parts.every((c) => insideQuad(q, c.x, c.z)));
      expect(roof, 'a building has an outline round all of it').toBeDefined();
    }
  });

  it("can't see under a roof: a door's screen isn't on the map, only the perimeter's walls", () => {
    expect(count(chain, 'block')).toBeGreaterThan(0);
    expect(satelliteOf(chain)!.walls).toEqual([]);
    const s = satelliteOf(walled)!;
    expect(s.walls.length).toBeGreaterThan(0);
    for (const [x0, z0, x1, z1] of s.walls) expect(s.roofs.some((q) => insideQuad(q, (x0 + x1) / 2, (z0 + z1) / 2))).toBe(false);
  });

  it('reads nothing that lives: no state, no guards, no targets, no vehicles', () => {
    const source = readFileSync(new URL('../src/app/minimap.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    for (const word of ['guards', 'objective', 'devices', 'vehicles', 'doors', 'layout', 'Simulation', 'Snapshot', 'solids', 'sim/game']) expect(source, word).not.toContain(word);
  });

  it('shows only what a world has: a built lot has no road, no creek and no woods', () => {
    const s = satelliteOf(SCENES['camp-brain']!().world(T))!;
    expect(s.fence.length).toBeGreaterThan(0);
    expect(s.roofs.length).toBeGreaterThan(0);
    expect([s.road, s.creek, s.trees.length]).toEqual([null, null, 0]);
  });

  it('has nothing to say about a bare test lot', () => {
    for (const name of ['movement-course', 'shooting-range', 'noise', 'spawn-tick']) expect(satelliteOf(SCENES[name]!().world(T)), name).toBeNull();
  });

  it('is north up and east to the right, over the play area', () => {
    const s = satelliteOf(chain)!;
    expect(s.side).toBe(2 * chain.playHalf);
    expect(mapPoint(s, 100, 0, 0)).toEqual({ x: 50, y: 50 });
    expect(mapPoint(s, 100, chain.playHalf, 0).x).toBeCloseTo(100, 6); // east: right
    expect(mapPoint(s, 100, 0, -chain.playHalf).y).toBeCloseTo(0, 6); // north, −z: up
  });
});

describe('a roof', () => {
  const box = (x: number, z: number, hx: number, hz: number, ux = 1, uz = 0) => ({ kind: 'box' as const, id: 0, x, z, y0: 0, y1: 3, hx, hz, ux, uz, flags: Blocks.All, surface: Surface.Wood });

  it('is the rectangle round the parts, squared to the biggest', () => {
    // A 10 by 6 roof, turned 45 degrees, over a wall that stands inside it.
    const c = Math.SQRT1_2;
    const q = roofOf([box(0, 0, 5, 3, c, c), box(1, -1, 1, 0.1, c, c)])!;
    const side = (a: number, b: number): number => Math.hypot(q[2 * a]! - q[2 * b]!, q[2 * a + 1]! - q[2 * b + 1]!);
    expect(side(0, 1)).toBeCloseTo(10, 6);
    expect(side(1, 2)).toBeCloseTo(6, 6);
    expect(insideQuad(q, 0, 0)).toBe(true);
    expect(insideQuad(q, 5, -5)).toBe(false);
  });

  it('is nothing for a shape with no box to square it to', () => {
    expect(roofOf([{ kind: 'cyl', id: 0, x: 0, z: 0, y0: 0, y1: 1, r: 1, flags: 0, surface: Surface.Wood }])).toBeNull();
  });
});

describe('a built camp', () => {
  it('counts a tall box as a wall, a low one not at all, and ignores what stands under a roof', () => {
    const roof = { kind: 'box' as const, x: 30, z: 0, y0: 3, y1: 3.2, hx: 6, hz: 4, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Wood };
    const wall = (x: number, z: number, height: number) => ({ kind: 'box' as const, x, z, y0: 0, y1: height, hx: 4, hz: 0.3, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Rock });
    const world = testWorld({
      size: 120,
      colliders: [roof, wall(-30, 0, 3), wall(-30, 20, 0.8), wall(30, 0, 3)],
      camp: { structures: [{ kind: 'building', colliders: [0] }], guards: [], fenceHalf: 0 },
      spawn: { x: 0, z: 30 },
    });
    const s = satelliteOf(world)!;
    expect(s.roofs.length).toBe(1);
    expect(s.walls).toEqual([[-34, 0, -26, 0]]);
  });
});
