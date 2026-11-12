import { beforeAll, describe, expect, it } from 'vitest';
import { defaultTuning as T, type Tuning } from '../src/config/tuning';
import { emptyRoute, navigatorOf } from '../src/sim/brain';
import { createBody } from '../src/sim/body';
import { InvariantWatch } from '../src/sim/body/invariants';
import { stimulus } from '../src/sim/game/drops';
import { compound } from '../src/sim/game/scenes/compound';
import { commanderOf } from '../src/sim/game/comms';
import { hardRoom } from '../src/sim/game/protection';
import { placePlayer } from '../src/sim/game/setup';
import { Simulation } from '../src/sim/game/sim';
import { oneStorey } from '../src/lab/experiments/circling';
import { readCorners } from '../src/lab/experiments/corners';
import { campMission, COMPOUND_TYPES, generateWorld, worldFingerprint, type CompoundType, type CruxKind } from '../src/sim/generation';
import { rimCells, stepsTo } from '../src/sim/generation/infiltrate';
import { buildRaster, openAt } from '../src/sim/generation/raster';
import { Cell, cellIndex, storeyAt } from '../src/sim/kernel/world/grid';
import { neutralInput } from '../src/sim/kernel/input';
import { startScene, type Scene } from '../src/sim/kernel/scene';
import { noWork } from '../src/sim/kernel/work';
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
    // The flight's own two ends, on its middle line: a body walks between these, not between the cells nearest them.
    const { footX, footZ, headX, headZ } = st;
    /** Which waypoint of a route is at a point, or −1. */
    const at = (r: typeof route, x: number, z: number): number => {
      for (let i = 0; i < r.points.length; i += 2) if (Math.hypot(r.points[i]! - x, r.points[i + 1]! - z) < 1e-6) return i / 2;
      return -1;
    };
    // Up: the foot of the flight, and the head of it next. Nothing is pulled taut across the stairs.
    expect(at(route, footX, footZ)).toBeGreaterThanOrEqual(0);
    expect(at(route, headX, headZ)).toBe(at(route, footX, footZ) + 1);
    // And from upstairs back down to the same point on the ground: the head, and the foot next. A
    // line from the head to the door below is clear on the ground, and no body can take it.
    const down = emptyRoute();
    expect(nav.find(target.x, target.z, siteCentre.x, siteCentre.z, {}, down, up.y)).toBe('found');
    expect(at(down, headX, headZ)).toBeGreaterThanOrEqual(0);
    expect(at(down, footX, footZ)).toBe(at(down, headX, headZ) + 1);
  });

  it('a body upstairs walks its route down the flight and out of the door, by the motor alone', () => {
    const sim = new Simulation(world, T);
    const G = world.grid;
    const st = G.stairs[0]!;
    const up = G.storeys[st.storey]!;
    const target = world.camp.guards.find((g) => g.role === 'target')!;
    const hq = world.camp.layout!.buildings.find((b) => b.module === 'hq')!;
    const door = world.camp.doors![hq.doors[0]!]!;
    const out = { x: door.x - door.nx * 4, z: door.z - door.nz * 4 };
    const route = emptyRoute();
    expect(navigatorOf(world, T).find(target.x, target.z, out.x, out.z, {}, route, up.y)).toBe('found');
    // The player in his place, on his floor: a body made standing there, as the game makes one.
    for (const g of [...sim.guards]) if (Math.hypot(g.body.x - target.x, g.body.z - target.z) < 1) sim.despawn(g.id);
    Object.assign(sim.player, createBody(world, sim.solids, T.bodies.player, target.x, target.z, 1, 0, up.y));
    expect(sim.player.y).toBeCloseTo(up.y, 2);
    const watch = new InvariantWatch(sim);
    const input = neutralInput();
    let next = 0;
    for (let t = 0; t < 60 * T.sim.tickHz && next < route.points.length; t++) {
      const dx = route.points[next]! - sim.player.x;
      const dz = route.points[next + 1]! - sim.player.z;
      if (Math.hypot(dx, dz) < 0.35) {
        next += 2;
        continue;
      }
      watch.beforeTick();
      sim.step({ ...input, yaw: yawFromDirection(dx, dz), moveZ: 1 });
      watch.afterTick();
    }
    expect(watch.report.first).toBeNull();
    expect(watch.report.inside).toBe(0);
    expect(next).toBe(route.points.length);
    expect(sim.player.y).toBeCloseTo(world.terrain.heightAt(sim.player.x, sim.player.z), 1);
  }, 60_000);

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

  it('a target who keeps upstairs has his hard room upstairs, and stays on that floor when the alarm goes up', () => {
    const target = world.camp.guards.find((g) => g.role === 'target')!;
    const room = hardRoom(world, target);
    expect(room.y).toBeCloseTo(target.y, 5);
    const scene = { ...(compound('seed=LAS-1274&attack=sniper') as Scene<Simulation>), world: () => world };
    const sim = startScene(scene, T, world);
    const driver = scene.driver!();
    const raw = scene.game.still(sim);
    const him = sim.guards.find((g) => g.id === commanderOf(sim)!.camp.objective!.target)!;
    const up = world.grid.storeys[world.grid.stairs[0]!.storey]!;
    let lowest = Infinity;
    for (let t = 0; t < 60 * T.sim.tickHz; t++) {
      sim.step(driver.next(sim, raw));
      lowest = Math.min(lowest, him.body.y);
    }
    expect(sim.fault).toBeFalsy();
    expect(lowest).toBeGreaterThan(up.y - 0.5);
  }, 120_000);

  it('a sound upstairs goes round by the stairs to a listener below, and reaches a listener on its own floor directly', () => {
    const a = new Acoustics(world, T);
    const G = world.grid;
    const st = G.stairs[0]!;
    const up = G.storeys[st.storey]!;
    const target = world.camp.guards.find((g) => g.role === 'target')!;
    a.spread({ x: target.x, y: up.y, z: target.z, radius: 60 });
    // On his own floor, two steps off in whichever direction has nothing between them.
    let same = emptyHeard();
    for (let k = 0; k < 16; k++) {
      const a16 = (k * Math.PI) / 8;
      const h = a.hear(target.x + Math.cos(a16) * 2, up.y + 1.65, target.z + Math.sin(a16) * 2, emptyHeard());
      if (h.walls === 0 && h.route !== 'none') {
        same = h;
        break;
      }
    }
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

describe('a route with an end upstairs', () => {
  it('costs what its legs cost, from anywhere in a long camp: the ground by landmarks, and one storey', () => {
    // LEB-2534 is a depot strung along its road, with its target upstairs. The men sent to his door
    // (the relief, from 130 m away) asked for one search over the ground and the floors together,
    // aimed straight at him: it spent its 40,000 cells and found nothing, twice in two ticks, each a
    // tick of 10 ms, and nobody came for him for another fifty seconds.
    const w = generateWorld(campMission('LEB-2534'), T);
    const G = w.grid;
    const nav = navigatorOf(w, T);
    const target = w.camp.guards.find((g) => g.role === 'target')!;
    const level = storeyAt(G, target.x, target.y, target.z);
    expect(level).toBeGreaterThanOrEqual(0);
    const st = G.stairs.find((s) => s.storey === level)!;
    const floor = G.storeys[level]!.layer;
    const storey = floor.nx * floor.nz;
    // From every post on the ground, and from the ground farthest from his stairs by foot.
    const from = w.camp.guards.filter((g) => !g.elevated).map((g) => ({ x: g.x, z: g.z }));
    const ground = new GridSearch(G.site);
    ground.flood([st.foot], { maxExpansions: ground.cost.length });
    let farthest = st.foot;
    for (let c = 0; c < G.site.nx * G.site.nz; c++) if (ground.cost[c]! > ground.cost[farthest]!) farthest = c;
    const far = { x: G.site.x0 + ((farthest % G.site.nx) + 0.5) * G.site.cell, z: G.site.z0 + (Math.floor(farthest / G.site.nx) + 0.5) * G.site.cell };
    expect(Math.hypot(far.x - st.footX, far.z - st.footZ)).toBeGreaterThan(100);
    from.push(far);
    expect(from.length).toBeGreaterThan(5);
    let most = 0;
    for (const p of from) {
      const toFoot = noWork();
      const up = noWork();
      const fromFoot = noWork();
      const down = noWork();
      const route = emptyRoute();
      expect(nav.find(p.x, p.z, st.footX, st.footZ, { work: toFoot }, emptyRoute())).toBe('found');
      expect(nav.find(p.x, p.z, target.x, target.z, { work: up }, route, undefined, target.y), `up from (${p.x.toFixed(0)}, ${p.z.toFixed(0)})`).toBe('found');
      expect(up.nodes).toBeLessThanOrEqual(toFoot.nodes + storey);
      // It ends at him, by the foot of his flight and then its head.
      const n = route.points.length;
      expect(Math.hypot(route.points[n - 2]! - target.x, route.points[n - 1]! - target.z)).toBeLessThan(1);
      const at = (x: number, z: number): number => {
        for (let i = 0; i < n; i += 2) if (Math.hypot(route.points[i]! - x, route.points[i + 1]! - z) < 1e-6) return i / 2;
        return -1;
      };
      expect(at(st.footX, st.footZ)).toBeGreaterThanOrEqual(0);
      expect(at(st.headX, st.headZ)).toBe(at(st.footX, st.footZ) + 1);
      // And the way back down costs the same kind of thing.
      expect(nav.find(st.footX, st.footZ, p.x, p.z, { work: fromFoot }, emptyRoute())).toBe('found');
      expect(nav.find(target.x, target.z, p.x, p.z, { work: down }, emptyRoute(), target.y)).toBe('found');
      expect(down.nodes).toBeLessThanOrEqual(fromFoot.nodes + storey);
      most = Math.max(most, up.nodes, down.nodes);
    }
    // No more than a route on the ground costs: a fight's whole tick has done 6,500 cells at its worst.
    expect(most).toBeLessThan(8000);
    // Floor to floor, from his room to the marksman at another building's upper window: down his
    // flight, over the ground, and up the other.
    const other = w.camp.guards.find((g) => storeyAt(G, g.x, g.y, g.z) >= 0 && storeyAt(G, g.x, g.y, g.z) !== level)!;
    expect(other).toBeDefined();
    const st2 = G.stairs.find((s) => s.storey === storeyAt(G, other.x, other.y, other.z))!;
    const across = emptyRoute();
    const work = noWork();
    expect(nav.find(target.x, target.z, other.x, other.z, { work }, across, target.y, other.y)).toBe('found');
    const where = (x: number, z: number): number => {
      for (let i = 0; i < across.points.length; i += 2) if (Math.hypot(across.points[i]! - x, across.points[i + 1]! - z) < 1e-6) return i / 2;
      return -1;
    };
    const order = [where(st.headX, st.headZ), where(st.footX, st.footZ), where(st2.footX, st2.footZ), where(st2.headX, st2.headZ)];
    expect(order[0]).toBeGreaterThanOrEqual(0);
    expect(order[1]).toBe(order[0]! + 1);
    expect(order[2]).toBeGreaterThan(order[1]!);
    expect(order[3]).toBe(order[2]! + 1);
    const m = across.points.length;
    expect(Math.hypot(across.points[m - 2]! - other.x, across.points[m - 1]! - other.z)).toBeLessThan(1);
    expect(work.nodes).toBeLessThan(8000);
  }, 60_000);

  it('between two ends on one floor never leaves the floor', () => {
    const G = world.grid;
    const nav = navigatorOf(world, T);
    const st = G.stairs[0]!;
    const up = G.storeys[st.storey]!;
    const cells: number[] = [];
    for (let c = 0; c < up.layer.nx * up.layer.nz; c++) if (up.layer.flags[c]! & Cell.Walkable) cells.push(c);
    const centre = (c: number): { x: number; z: number } => ({ x: up.layer.x0 + ((c % up.layer.nx) + 0.5) * up.layer.cell, z: up.layer.z0 + (Math.floor(c / up.layer.nx) + 0.5) * up.layer.cell });
    const a = centre(cells[0]!);
    const b = centre(cells[cells.length - 1]!);
    const work = noWork();
    const route = emptyRoute();
    expect(nav.find(a.x, a.z, b.x, b.z, { work }, route, up.y, up.y)).toBe('found');
    expect(work.nodes).toBeLessThanOrEqual(cells.length);
    const n = route.points.length;
    expect(Math.hypot(route.points[n - 2]! - b.x, route.points[n - 1]! - b.z)).toBeLessThan(1);
    // Every waypoint is over the floor.
    for (let i = 0; i < n; i += 2) expect(cellIndex(up.layer, route.points[i]!, route.points[i + 1]!)).toBeGreaterThanOrEqual(0);
  });
});

describe("the analysis's upper floor", () => {
  it('is one piece, joined to the ground by its stairs, on a camp turned off the world’s axes', () => {
    // The raster lies along the camp's axes and the storey's layer along the world's. On ZUV-9136,
    // a farm turned 51° whose target is to be reached, three straight lines between raster cells'
    // middles left the head of the stairs in a pocket of its own: no way in, and the camp built again.
    const w = generateWorld(campMission('ZUV-9136'), T);
    const L = w.camp.layout!;
    expect(w.camp.crux).toBe('inside');
    expect(Math.min(Math.abs(L.ux), Math.abs(L.uz))).toBeGreaterThan(0.5);
    const R = buildRaster(w.camp, w.terrain, w.colliders, w.grid.site, T.gen, w.props.trees, w.grid);
    expect(R.extra).toBeGreaterThan(100);
    const steps = stepsTo(R, rimCells(R));
    for (let e = 0; e < R.extra; e++) expect(steps[R.na * R.nb + e], `upper cell ${e}`).toBeGreaterThanOrEqual(0);
    // And the way in to him is found the first time the camp is built.
    expect(w.report.camp!.infiltration.found).toBe(true);
    expect(w.report.campAttempt).toBe(0);
    expect(w.report.firstFailed).toEqual([]);
  }, 60_000);

  it('keeps two slabs a cell: out on his floor, nothing below it closes the room he stands in', () => {
    const R = buildRaster(world.camp, world.terrain, world.colliders, world.grid.site, T.gen, world.props.trees, world.grid);
    const hq = world.camp.layout!.buildings.find((b) => b.module === 'hq')!;
    const up = world.grid.storeys[hq.storey]!;
    let open = 0;
    let cells = 0;
    for (let c = 0; c < up.layer.nx * up.layer.nz; c++) {
      if ((up.layer.flags[c]! & Cell.Walkable) === 0) continue;
      const x = up.layer.x0 + ((c % up.layer.nx) + 0.5) * up.layer.cell;
      const z = up.layer.z0 + (Math.floor(c / up.layer.nx) + 0.5) * up.layer.cell;
      // Clear of the walls' own row of raster cells, which is solid by design.
      const dx = x - hq.x;
      const dz = z - hq.z;
      if (Math.abs(dx * hq.ux + dz * hq.uz) > hq.length / 2 - 1.5 || Math.abs(-dx * hq.uz + dz * hq.ux) > hq.depth / 2 - 1.5) continue;
      cells++;
      if (openAt(R, x, up.y + T.gen.sight.chest, z) && openAt(R, x, up.y + T.gen.sight.eye, z)) open++;
    }
    expect(cells).toBeGreaterThan(50);
    // All but the cells the rail round the stairwell runs through.
    expect(open / cells).toBeGreaterThan(0.9);
  });
});

describe('what taller camps are for (the owner, Nov 10)', () => {
  it('with every storey one, each kind of place generates what it did on one storey', () => {
    // Everything upper floors changed is the types' own data, so the same seeds can be measured
    // both ways (npm run experiment -- taller, corners). These are Step 1's camps, fingerprinted
    // on main (#34) with the fields a second storey added left out.
    const before: Array<[string, CompoundType, string]> = [
      ['MAZ-1737', 'walled', '5d2134af69fdd862'],
      ['HAM-3144', 'keep', '114ae6a5b563b24e'],
      ['TAP-5457', 'depot', '03f9552b4045ce4c'],
      ['HUB-9331', 'farm', '23f833cb57d1b468'],
    ];
    for (const [seed, type, was] of before) {
      const w = generateWorld(campMission(seed), oneStorey(T));
      expect(w.camp.layout!.type, seed).toBe(type);
      for (const key of ['windows', 'storeys', 'stairs']) delete (w.camp as unknown as Record<string, unknown>)[key];
      for (const key of ['storeys', 'stairs']) delete (w.grid as unknown as Record<string, unknown>)[key];
      for (const b of w.camp.layout!.buildings as unknown as Array<Record<string, unknown>>) {
        delete b.storeys;
        delete b.floorY;
        delete b.storey;
      }
      expect(worldFingerprint(w), `${seed}, a ${type}`).toBe(was);
    }
  }, 300_000);

  it('buries its target on a floor with no windows, in one room that the head of his stairs shows all of', () => {
    const hq = world.camp.layout!.buildings.findIndex((b) => b.module === 'hq');
    expect((world.camp.windows ?? []).filter((w) => w.building === hq)).toEqual([]);
    // The owner's limit, in the lab's numbers (npm run experiment -- corners).
    const r = readCorners(world, T);
    expect(r.targetUp).toBe(1);
    expect(r.buriedNowhere, 'nobody outside his building has a line to him').toBe(1);
    expect(r.floorSeen, 'his floor from the head of his stairs, %').toBe(100);
    expect(r.himSeen).toBe(1);
    expect(r.unread, 'men besides him nobody outside can read').toBe(0);
    expect(r.noWindow, 'posts upstairs with no window').toBe(0);
    expect(r.rooms, 'buildings besides his that hold someone unread').toBe(0);
    expect(r.wayIn).toBe(1);
    expect(r.wayOther, 'the way in goes through his building and no other').toBe(0);
  }, 60_000);

  it('stands its marksmen at upper windows before its towers, each looking out of his window', () => {
    const L = world.camp.layout!;
    const marksmen = world.camp.guards.filter((g) => g.role === 'marksman');
    const posts = L.towers.filter((t) => t.corner === 'window');
    expect(posts.length).toBeGreaterThanOrEqual(1);
    // The first place a marksman takes is a window's, and none is in the target's building.
    expect(L.towers[0]!.corner).toBe('window');
    for (const t of posts) expect(L.buildings[t.building!]!.module).not.toBe('hq');
    const first = marksmen.find((g) => Math.hypot(g.x - posts[0]!.x, g.z - posts[0]!.z) < 1e-6)!;
    expect(first).toBeDefined();
    expect(storeyAt(world.grid, first.x, first.y, first.z)).toBeGreaterThanOrEqual(0);
    // A pace back from a window: the wall's gap is right in front of him.
    const out = posts[0]!.out!;
    expect(world.camp.windows!.some((x) => Math.hypot(x.x - (first.x + out.x * 0.9), x.z - (first.z + out.z * 0.9)) < 0.1)).toBe(true);
  });

  it('shows every perch less of its men than validation allows, and eases well under that', () => {
    const kind = T.gen.compound.types.keep;
    const most = Math.max(...world.report.camp!.perches.map((p) => p.coverage));
    expect(most).toBeLessThanOrEqual(kind.maxCoverage);
    expect(kind.maxCoverage).toBeLessThan(T.gen.compound.types.yard.maxCoverage);
    expect(kind.easeTo).toBeLessThan(kind.maxCoverage);
  });
});
