import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { emptyRoute, emptySteering, followRoute, navigatorOf, routeLength, type Route } from '../src/sim/brain/nav';
import { campMission } from '../src/sim/generation';
import { generateWorld } from '../src/sim/generation/world';
import { player } from '../src/sim/game/entities';
import { placePlayer } from '../src/sim/game/setup';
import { Simulation } from '../src/sim/game/sim';
import { SYSTEMS } from '../src/sim/game/systems';
import { neutralInput } from '../src/sim/kernel/input';
import { missionSpec } from '../src/sim/kernel/mission';
import { withSystem, type System } from '../src/sim/kernel/systems';
import { Blocks, type ColliderInput } from '../src/sim/kernel/world/colliders';
import { Surface } from '../src/sim/kernel/world/surfaces';
import { turnTowards, yawFromDirection } from '../src/sim/kernel/core/math';
import type { World } from '../src/sim/kernel/world/world';
import { testGuard, testWorld } from './fixtures';

/**
 * Navigation (E1): A* over the two grid layers with an iteration budget, string-pulled
 * into waypoints the motor walks, and a walk that gets out of the way of what it can't
 * see on the grid (a body in its path).
 */

const wall = (x: number, z: number, hx: number, hz: number): ColliderInput => ({ kind: 'box', x, z, y0: -0.3, y1: 3, hx, hz, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Rock });

/** A square room (±10 m) with a 1.2 m doorway in its east wall, in the middle of a field. */
function room(): World {
  const colliders = [
    wall(0, -10, 10.25, 0.25),
    wall(0, 10, 10.25, 0.25),
    wall(-10, 0, 0.25, 10.25),
    // The east wall, in two pieces leaving a doorway at z in [-0.6, 0.6].
    wall(10, -5.65, 0.25, 5.05),
    wall(10, 5.65, 0.25, 5.05),
  ];
  return testWorld({ size: 120, colliders, spawn: { x: -30, z: 30 } });
}

function waypoints(r: Route): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < r.points.length; i += 2) out.push([r.points[i]!, r.points[i + 1]!]);
  return out;
}

describe('navigation', () => {
  it('finds a route through a doorway the map layer cannot see, and pulls it into few waypoints', () => {
    const world = room();
    const nav = navigatorOf(world, T);
    const r = emptyRoute();
    const work = { rays: 0, nodes: 0, bodies: 0 };
    expect(nav.find(-5, 0, 30, 0, { work }, r)).toBe('found');
    const pts = waypoints(r);
    expect(pts.length).toBeLessThanOrEqual(4);
    // It goes through the doorway: some waypoint near it, or a straight line through it.
    let cross = false;
    let px = -5;
    let pz = 0;
    for (const [x, z] of pts) {
      if ((px < 10 && x >= 10) || (px >= 10 && x < 10)) {
        const t = (10 - px) / (x - px);
        const zc = pz + (z - pz) * t;
        if (Math.abs(zc) < 0.6) cross = true;
      }
      px = x;
      pz = z;
    }
    expect(cross).toBe(true);
    expect(work.nodes).toBeGreaterThan(0);
    // Ends at the goal.
    const [lx, lz] = pts[pts.length - 1]!;
    expect(Math.hypot(lx - 30, lz)).toBeLessThan(0.5);
  });

  it('never cuts what the search went around: every pulled segment is clear', () => {
    const world = room();
    const nav = navigatorOf(world, T);
    const r = emptyRoute();
    expect(nav.find(-8, -8, 8, 8, {}, r)).toBe('found');
    let px = -8;
    let pz = -8;
    for (const [x, z] of waypoints(r)) {
      expect(nav.clear(px, pz, x, z)).toBe(true);
      px = x;
      pz = z;
    }
  });

  it('ends as near as a body can stand when the goal is inside something solid', () => {
    const world = testWorld({ size: 120, colliders: [wall(0, 0, 1.5, 1.5)], spawn: { x: -30, z: 30 } });
    const nav = navigatorOf(world, T);
    const r = emptyRoute();
    expect(nav.find(-12, 0, 0, 0, { work: { rays: 0, nodes: 0, bodies: 0 } }, r)).toBe('found');
    const [ex, ez] = waypoints(r).at(-1)!;
    expect(Math.abs(ex) > 1.5 || Math.abs(ez) > 1.5).toBe(true);
    expect(Math.hypot(ex, ez)).toBeLessThan(4.5);
  });

  it('says there is no route where there is none, and when a budget runs out', () => {
    // A sealed room: walls all round.
    const world = testWorld({
      size: 80,
      colliders: [wall(0, -5, 5.25, 0.25), wall(0, 5, 5.25, 0.25), wall(-5, 0, 0.25, 5.25), wall(5, 0, 0.25, 5.25)],
      spawn: { x: -30, z: 30 },
    });
    const nav = navigatorOf(world, T);
    const r = emptyRoute();
    expect(nav.find(0, 0, 25, 25, {}, r)).toBe('no-route');
    const small = structuredClone(T);
    small.brain.nav.siteExpansions = 4;
    small.brain.nav.mapExpansions = 2;
    const tight = navigatorOf(room(), small);
    expect(tight.find(-5, 0, 30, 0, {}, r)).toBe('out-of-budget');
    expect(r.points.length).toBe(0);
  });

  it('finds the same route every time, cell for cell', () => {
    const world = room();
    const a = emptyRoute();
    const b = emptyRoute();
    navigatorOf(world, T).find(-7, 3, 26, -9, {}, a);
    navigatorOf(world, T).find(-7, 3, 26, -9, {}, b);
    expect(a.points).toEqual(b.points);
  });

  it('goes coarse across the valley, refining inside the camp, and every segment is walkable', () => {
    const world = generateWorld(missionSpec('TAL-4471'), T);
    const nav = navigatorOf(world, T);
    const site = world.camp.site;
    const r = emptyRoute();
    // From inside the camp out to the overlook.
    const dx = world.spawn.x - site.x;
    const dz = world.spawn.z - site.z;
    const d = Math.hypot(dx, dz);
    const work = { rays: 0, nodes: 0, bodies: 0 };
    expect(nav.find(site.x, site.z, world.spawn.x, world.spawn.z, { work }, r)).toBe('found');
    expect(routeLength(r, site.x, site.z)).toBeGreaterThan(d * 0.9);
    let px = site.x;
    let pz = site.z;
    for (const [x, z] of waypoints(r)) {
      expect(nav.clear(px, pz, x, z), `${px.toFixed(1)},${pz.toFixed(1)} to ${x.toFixed(1)},${z.toFixed(1)}`).toBe(true);
      px = x;
      pz = z;
    }
    expect(work.nodes).toBeLessThan(T.brain.nav.mapExpansions + 2 * T.brain.nav.siteExpansions);
  });
});

/**
 * Guards under a test brain that walks a route with the motor: its order every tick from
 * followRoute, from a route found once. Bodies obey every rule the player's do.
 */
function walkers(world: World, goals: Array<{ x: number; z: number }>): { sim: Simulation; routes: Route[]; done: boolean[]; arrived: number[] } {
  const routes = goals.map(() => emptyRoute());
  const done = goals.map(() => false);
  const arrived = goals.map(() => -1);
  const steer = emptySteering();
  const brain: System = {
    name: 'test-walker',
    phase: 'decide',
    after: ['guard-brains'],
    reads: ['guard.body', 'guard.guard'],
    writes: ['guard.guard.order'],
    emits: [],
    run(ctx) {
      for (const g of ctx.index.of('guard')) {
        const k = g.guard.spawn;
        const r = routes[k]!;
        const o = g.guard.order;
        if (done[k]) {
          o.tick = ctx.tick + 1;
          o.wishX = 0;
          o.wishZ = 0;
          o.gait = 'idle';
          continue;
        }
        if (r.points.length === 0 && arrived[k]! < 0) {
          if (navigatorOf(ctx.world, ctx.tuning).find(g.body.x, g.body.z, goals[k]!.x, goals[k]!.z, { work: ctx.work }, r) !== 'found') throw new Error(`no route for guard ${k}`);
        }
        const w = followRoute(r, g.body.x, g.body.z, ctx.tuning.bodies.guard.speed.walk, g.id, ctx.tick, ctx.tuning, steer);
        if (w === 'arrived') {
          done[k] = true;
          arrived[k] = ctx.tick;
          o.wishX = 0;
          o.wishZ = 0;
          o.gait = 'idle';
          o.tick = ctx.tick + 1;
          continue;
        }
        o.tick = ctx.tick + 1;
        o.wishX = steer.wishX;
        o.wishZ = steer.wishZ;
        o.gait = 'walk';
        o.yaw = turnTowards(g.body.yaw, yawFromDirection(steer.dirX, steer.dirZ), 8 * ctx.dt);
        o.headYaw = 0;
      }
    },
  };
  const sim = new Simulation(world, T, withSystem(SYSTEMS, brain));
  return { sim, routes, done, arrived };
}

function hold(s: Simulation, seconds: number, stop: () => boolean = () => false): number {
  const raw = neutralInput();
  let i = 0;
  for (; i < seconds * 30 && !stop(); i++) s.step(raw);
  return i;
}

function guardAt(x: number, z: number, id = 0): ReturnType<typeof testGuard> {
  return testGuard({ id, role: 'sentry', x, y: 0, z, faceX: 0, faceZ: -1, elevated: false, route: null, routeStart: 0, scanPhase: 0, scanScale: 0 });
}

describe('walking a route', () => {
  it('walks through the door and arrives, the motor carrying him', () => {
    const colliders = [
      wall(0, -10, 10.25, 0.25),
      wall(0, 10, 10.25, 0.25),
      wall(-10, 0, 0.25, 10.25),
      wall(10, -5.65, 0.25, 5.05),
      wall(10, 5.65, 0.25, 5.05),
    ];
    const world = testWorld({ size: 120, colliders, spawn: { x: -30, z: 30 }, camp: { structures: [], guards: [guardAt(-6, 2)], fenceHalf: 0 } });
    const goal = { x: 30, z: 0 };
    const { sim, done, arrived } = walkers(world, [goal]);
    const ticks = hold(sim, 60, () => done[0]!);
    expect(done[0]).toBe(true);
    expect(Math.hypot(sim.guards[0]!.body.x - goal.x, sim.guards[0]!.body.z - goal.z)).toBeLessThan(0.8);
    expect(ticks / 30).toBeLessThan(40);
    expect(arrived[0]).toBeGreaterThan(0);
  });

  it('steps around a body in the way instead of shoving through it', () => {
    // A guard walks straight along a line toward a goal; the player stands in the way on it.
    const world = testWorld({ size: 120, spawn: { x: -30, z: 30 }, camp: { structures: [], guards: [guardAt(-10, 0)], fenceHalf: 0 } });
    const { sim, done } = walkers(world, [{ x: 10, z: 0 }]);
    placePlayer(sim, 0, 0, -1, 0);
    let closest = Infinity;
    let pushed = 0;
    const start = { x: sim.player.x, z: sim.player.z };
    const raw = neutralInput();
    let i = 0;
    for (; i < 45 * 30 && !done[0]; i++) {
      sim.step(raw);
      const g = sim.guards[0]!.body;
      closest = Math.min(closest, Math.hypot(g.x - sim.player.x, g.z - sim.player.z));
      pushed = Math.max(pushed, Math.hypot(sim.player.x - start.x, sim.player.z - start.z));
    }
    expect(done[0], `guard ended at ${sim.guards[0]!.body.x.toFixed(2)}, ${sim.guards[0]!.body.z.toFixed(2)}`).toBe(true);
    // The guard never pushed the player aside, and never tried to stand inside him.
    expect(pushed).toBeLessThan(0.05);
    expect(closest).toBeGreaterThan(0.45);
    expect(sim.guards[0]!.body.x).toBeGreaterThan(9);
    expect(player(sim.index).id).toBe(1);
  });

  it('two guards walking head-on pass each other', () => {
    const world = testWorld({
      size: 120,
      spawn: { x: -30, z: 30 },
      camp: { structures: [], guards: [guardAt(-10, 0, 0), guardAt(10, 0.02, 1)], fenceHalf: 0 },
    });
    const { sim, done } = walkers(world, [{ x: 10, z: 0 }, { x: -10, z: 0 }]);
    hold(sim, 40, () => done[0]! && done[1]!);
    expect(done).toEqual([true, true]);
  });
});

describe('routes off the camp', () => {
  it('reaches the ground that overlooks the camp from every post, and leaves by the side it is going to', () => {
    const world = generateWorld(campMission('LEB-2534'), T);
    const nav = navigatorOf(world, T);
    const route = emptyRoute();
    const perches = world.report.camp!.perches as ReadonlyArray<{ x: number; z: number }>;
    let found = 0;
    let tried = 0;
    let worst = 0;
    for (const g of world.camp.guards) {
      if (g.elevated) continue;
      for (const p of perches) {
        tried++;
        if (nav.find(g.x, g.z, p.x, p.z, {}, route) !== 'found') continue;
        found++;
        worst = Math.max(worst, routeLength(route, g.x, g.z) / Math.hypot(p.x - g.x, p.z - g.z));
      }
    }
    expect(found / tried).toBeGreaterThan(0.95);
    // Leaving by whichever edge is nearest, a route to the far side goes round the whole camp.
    expect(worst).toBeLessThan(2);
  }, 60_000);
});
