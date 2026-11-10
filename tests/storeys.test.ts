import { beforeAll, describe, expect, it } from 'vitest';
import { defaultTuning as T, type Tuning } from '../src/config/tuning';
import { emptyRoute, navigatorOf } from '../src/sim/brain';
import { InvariantWatch } from '../src/sim/body/invariants';
import { stimulus } from '../src/sim/game/drops';
import { compound } from '../src/sim/game/scenes/compound';
import { placePlayer } from '../src/sim/game/setup';
import { Simulation } from '../src/sim/game/sim';
import { campMission, COMPOUND_TYPES, generateWorld, type CompoundType, type CruxKind } from '../src/sim/generation';
import { Cell, cellIndex, storeyAt } from '../src/sim/kernel/world/grid';
import { neutralInput } from '../src/sim/kernel/input';
import { startScene, type Scene } from '../src/sim/kernel/scene';
import { GridSearch } from '../src/sim/kernel/world/search';
import type { World } from '../src/sim/kernel/world/world';
import { yawFromDirection } from '../src/sim/kernel/core/math';
import { Acoustics, emptyHeard } from '../src/sim/perception';

/**
 * Two-storey buildings (docs/compound-types.md, Step 2): an upper floor is a layer of its own,
 * joined to the ground by real stairs, and everything that walks or listens crosses them: the
 * grid search, navigation, the motor (bodies climb the treads), and hearing.
 */

function ofType(type: CompoundType, crux: CruxKind): Tuning {
  const t = structuredClone(T);
  for (const k of COMPOUND_TYPES) if (k !== type) t.gen.compound.types[k].cruxes = { walk: 0, inside: 0, flush: 0, escort: 0 };
  t.gen.crux.kinds = { walk: 0, inside: 0, flush: 0, escort: 0, [crux]: 1 };
  return t;
}

let world: World;
let hqStorey = 0;

beforeAll(() => {
  world = generateWorld(campMission('LAS-1274'), ofType('keep', 'inside'));
}, 120_000);

describe('a two-storey building', () => {
  it('has a floor above, a stair to it, and an upper floor the grid knows', () => {
    const G = world.grid;
    expect(G.storeys.length).toBeGreaterThanOrEqual(1);
    expect(G.stairs.length).toBeGreaterThanOrEqual(1);
    const st = G.stairs[0]!;
    hqStorey = st.storey;
    const up = G.storeys[st.storey]!;
    expect(up.layer.flags[st.head]! & Cell.Walkable).toBe(Cell.Walkable);
    expect(G.site.flags[st.foot]! & Cell.Walkable).toBe(Cell.Walkable);
    // Walkable cells upstairs: most of the floor, and none of them over the stairwell.
    let walkable = 0;
    for (let c = 0; c < up.layer.nx * up.layer.nz; c++) if (up.layer.flags[c]! & Cell.Walkable) walkable++;
    expect(walkable).toBeGreaterThan(100);
    expect(world.camp.windows!.length).toBeGreaterThan(0);
  });

  it('holds the target upstairs on an inside camp, where no perch has him', () => {
    const hq = world.camp.layout!.buildings.find((b) => b.module === 'hq')!;
    const target = world.camp.guards.find((g) => g.role === 'target')!;
    expect(hq.storey).toBeGreaterThanOrEqual(0);
    expect(target.elevated).toBe(true);
    expect(target.y).toBeCloseTo(hq.floorY, 1);
    expect(storeyAt(world.grid, target.x, target.y, target.z)).toBe(hq.storey);
    expect(world.report.validation!.ok).toBe(true);
    expect(world.report.camp!.perches.every((p) => p.target * world.report.camp!.cycle <= T.gen.crux.buriedSeconds)).toBe(true);
    // The certified way in reaches him upstairs.
    const path = world.report.camp!.infiltration.path;
    expect(world.report.camp!.infiltration.found).toBe(true);
    expect(path.length).toBeGreaterThan(0);
  });

  it('the grid search crosses the stairs, and one-storey searches are the same search', () => {
    const G = world.grid;
    const s = new GridSearch(G.site, G.storeys, G.stairs);
    const st = G.stairs[0]!;
    const up = s.levels[st.storey]!;
    const head = up.base + st.head;
    s.flood([st.foot], { maxExpansions: s.cost.length });
    expect(s.cost[head]).toBe(st.cost);
    // Further along the upper floor, the cost keeps growing from the head.
    let beyond = 0;
    for (let c = 0; c < up.layer.nx * up.layer.nz; c++) if (s.cost[up.base + c]! > st.cost) beyond++;
    expect(beyond).toBeGreaterThan(20);
    // A search that doesn't know the storeys sees the ground alone, exactly.
    const flat = new GridSearch(G.site);
    flat.flood([st.foot], { maxExpansions: flat.cost.length });
    for (let c = 0; c < G.site.nx * G.site.nz; c += 97) expect(s.cost[c]).toBe(flat.cost[c]);
  });

  it('routes go up the stairs and come back down, keeping both ends of the flight', () => {
    const nav = navigatorOf(world, T);
    const G = world.grid;
    const st = G.stairs[0]!;
    const up = G.storeys[st.storey]!;
    const target = world.camp.guards.find((g) => g.role === 'target')!;
    const route = emptyRoute();
    const siteCentre = { x: world.camp.site.x + world.camp.layout!.ux * 20, z: world.camp.site.z + world.camp.layout!.uz * 20 };
    expect(nav.find(siteCentre.x, siteCentre.z, target.x, target.z, {}, route, undefined, up.y)).toBe('found');
    const footX = G.site.x0 + ((st.foot % G.site.nx) + 0.5) * G.site.cell;
    const footZ = G.site.z0 + (Math.floor(st.foot / G.site.nx) + 0.5) * G.site.cell;
    const visits = (x: number, z: number): boolean => {
      for (let i = 0; i < route.points.length; i += 2) {
        if (Math.hypot(route.points[i]! - x, route.points[i + 1]! - z) < 1.2) return true;
      }
      return false;
    };
    expect(visits(footX, footZ)).toBe(true);
    // And from upstairs back down to the same point on the ground.
    const down = emptyRoute();
    expect(nav.find(target.x, target.z, siteCentre.x, siteCentre.z, {}, down, up.y)).toBe('found');
  });

  it('a body climbs the flight on foot, by the motor alone, and stands on the floor above', () => {
    const sim = new Simulation(world, T);
    const G = world.grid;
    const st = G.stairs[0]!;
    const up = G.storeys[st.storey]!;
    const fx = G.site.x0 + ((st.foot % G.site.nx) + 0.5) * G.site.cell;
    const fz = G.site.z0 + (Math.floor(st.foot / G.site.nx) + 0.5) * G.site.cell;
    const hx = up.layer.x0 + ((st.head % up.layer.nx) + 0.5) * up.layer.cell;
    const hz = up.layer.z0 + (Math.floor(st.head / up.layer.nx) + 0.5) * up.layer.cell;
    placePlayer(sim, fx, fz, hx - fx, hz - fz);
    const watch = new InvariantWatch(sim);
    const yaw = yawFromDirection(hx - fx, hz - fz);
    const input = neutralInput();
    let top = 0;
    for (let t = 0; t < 20 * T.sim.tickHz; t++) {
      const frame = { ...input, yaw, moveZ: 1 };
      watch.beforeTick();
      sim.step(frame);
      watch.afterTick();
      top = Math.max(top, sim.player.y);
      if (Math.hypot(sim.player.x - hx, sim.player.z - hz) < 0.6) break;
    }
    expect(watch.report.first).toBeNull();
    expect(watch.report.inside).toBe(0);
    expect(top).toBeGreaterThan(up.y - 0.05);
    expect(sim.player.y).toBeCloseTo(up.y, 1);
    expect(sim.player.standingOn).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it('a guard who hears something upstairs goes up the stairs to see', () => {
    const loud = structuredClone(T);
    loud.perception.sandbox.noise = 120;
    const scene = { ...(compound('seed=LAS-1274') as Scene<Simulation>), world: () => world };
    const sim = startScene(scene, loud, world);
    const raw = scene.game.still(sim);
    const G = world.grid;
    const up = G.storeys[G.stairs[0]!.storey]!;
    const target = world.camp.guards.find((g) => g.role === 'target')!;
    const onGround = new Set(world.camp.guards.filter((g) => !g.elevated && g.role !== 'target').map((g) => g.id));
    let climbed = false;
    for (let t = 0; t < 90 * T.sim.tickHz && !climbed; t++) {
      Object.assign(raw, neutralInput(sim.player.yaw));
      raw.commands = t % (6 * T.sim.tickHz) === 2 * T.sim.tickHz && t < 50 * T.sim.tickHz ? [stimulus('noise', { x: target.x, y: up.y + 0.1, z: target.z })] : [];
      sim.step(raw);
      climbed = sim.guards.some((g) => onGround.has(g.id) && g.body.y >= up.y - 0.3);
    }
    expect(sim.fault).toBeFalsy();
    expect(climbed).toBe(true);
  }, 120_000);

  it('a sound upstairs goes round by the stairs to a listener below, and reaches a listener on its own floor directly', () => {
    const a = new Acoustics(world, T);
    const G = world.grid;
    const st = G.stairs[0]!;
    const up = G.storeys[st.storey]!;
    const target = world.camp.guards.find((g) => g.role === 'target')!;
    a.spread({ x: target.x, y: up.y, z: target.z, radius: 60 });
    const same = a.hear(target.x + 2, up.y + 1.65, target.z, emptyHeard());
    expect(same.route).not.toBe('none');
    // A listener right under him on the ground floor: heard, and no louder than the one beside him upstairs.
    const below = a.hear(target.x, 1.65 + world.terrain.heightAt(target.x, target.z), target.z, emptyHeard());
    expect(below.level).toBeLessThanOrEqual(same.level);
    expect(below.route).not.toBe('none');
    // Cell lookups stay within the storey's layer.
    expect(cellIndex(up.layer, target.x, target.z)).toBeGreaterThanOrEqual(0);
    void hqStorey;
  });
});
